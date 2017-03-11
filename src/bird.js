// @flow

const Twitter = require("twitter")
const Fs = require("fs")
const Argparse = require("argparse")
const Progress = require("progress")

const Log = require("./log")

const ENV_TWITTER_TOKEN_NAMES:Object = {
  "BIRD_COMSUMER_KEY":"consumer_key",
  "BIRD_CONSUMER_SECRET":"consumer_secret",
  "BIRD_ACCESS_TOKEN_KEY": "access_token_key",
  "BIRD_ACCESS_TOKEN_SECRET" : "access_token_secret",
  "BIRD_MY_SCREEN_NAME" : "my_screen_name"
}

class Config extends Object {
  consumer_key:string
  consumer_secret:string
  access_token_key:string
  access_token_secret:string
  my_screen_name: string

  constructor() { super() }

  isConfigured():bool {
    return !(
      (this.consumer_key
            && this.consumer_secret
            && this.access_token_key
            && this.access_token_secret
            && this.my_screen_name) === undefined
          )
  }
}

type TypeConfig = {
  consumer_key:string,
  consumer_secret:string,
  access_token_key:string,
  access_token_secret:string,
  my_screen_name: string
}

class SafeListPromises extends Object {

  loadFile(dataFileName: string):Promise<*>{
    return new Promise((resolve, reject) => {
      Log.n("Reading SafeList file")
      Fs.stat(dataFileName, (err, stat: Fs.Stats) => {
        if (stat.isFile()) {
          // TODO: read and load
          Fs.readFile(dataFileName, "utf-8", (error, data) => {
            Log.n("Read. Parsing now")
            if (error) {
              reject(`Error while reading file ${dataFileName} : ${error.toString()}`)
              return
            }

            var safeListTable:Object = {}
            let lines: [string] = data.split(/\s+/)
            let count = 0
            for (let line: string of lines) {
              count++
              safeListTable[line.replace(/[^0-9]]+/, "")] = 0
            }
            Log.n(`Copied IDs. Total: ${count}`)
            resolve(safeListTable)
          })
        }
        else {
          reject(`File not exists : ${dataFileName||'null'}`)
          Log.e(`File not exists : ${dataFileName||'null'}`)
        }
      })
    })
  }

  fetchFromTwitterProfile(client:Twitter, fromScreenName:string) : Promise<*> {
    return new Promise(function(resolve, reject) {
      Log.n("Fetching friends of your twitter account to create SafeList")

      client.get("/friends/ids", {screen_name:fromScreenName,stringify_ids:true}, (error, tweets, response) => {
        //console.log(error)
        //console.log(response)
        var safeListTable: Object = {}
        if (!error) {
          let count = 0
          for (let id of tweets.ids) {
            safeListTable[id] = 0
            count++
          }
          Log.n(`Copied IDs. Total: ${count}`)
          resolve(safeListTable)
        }
        else {
          reject(safeListTable)
        }
      })
    })
  }
}

function main(args: Array<string>): void {
  let parser: Argparse.ArgumentParser =
   new Argparse.ArgumentParser(
     {  version: '0.0.1', addHelp:true, description: 'Blocks harmful twitter and twitters'})
  parser.addArgument(["-f", "--friends"], { help : "Block friends(followings) of given user", action: "storeTrue" })
  parser.addArgument(["-F", "--followers"], { help : "Block followers of given user", action: "storeTrue" })
  parser.addArgument(["-u", "--username"], { help : "Pass @username to be targeted" })
  parser.addArgument(["-s", "--safelist"], { help : "Load 'safe list(which may contains list of twitter IDs, not screen names)' from file"})
  parser.addArgument(["-g", "--generate-safelist"], { help : "Generate safelist file and exit", action: "storeTrue"  })
  parser.addArgument(["-c", "--config"], { help : "Pass twitter token configuration file name (JSON)" })

  let parsedArgs: Object = parser.parseArgs()
  let safeList: SafeListPromises = new SafeListPromises()
  var config: Config = new Config()
  Log.n("Processing arguments")

  if (parsedArgs.config) {
    let configFile = (parsedArgs.config:string)
    let jsonConfigData = JSON.parse(Fs.readFileSync(configFile, "utf-8"))
    for (let jsonConfigKey in jsonConfigData) {
      config[jsonConfigKey] = jsonConfigData[jsonConfigKey]
    }
  }
  else {
    // Obtain information from Environment variables
    for (let envname:string in ENV_TWITTER_TOKEN_NAMES) {
      config[ENV_TWITTER_TOKEN_NAMES[envname]] = process.env[envname]
    }
  }

  let preparationPromises: Array<Promise<*>> = []

  if (config.isConfigured()) {
    let client: Twitter = new Twitter(config)

    if (parsedArgs.safelist) {
      preparationPromises.push(safeList.loadFile(parsedArgs.safelist))
    }
    else {
      preparationPromises.push(safeList.fetchFromTwitterProfile(client, config.my_screen_name))
    }

    Promise.all(preparationPromises).then((values)=> {
      Log.n("Completed")

      let safeList: Object = values[0]
      let listSource: string = ""

      if (parsedArgs.followers === true) {
        listSource = "/followers/ids"
      }
      else if (parsedArgs.friends === true) {
        listSource = "/friends/ids"
      }
      else {
        Log.e("Please target followers or friends(following)")
        process.exit(-1)
      }

      if (parsedArgs.username == "" || parsedArgs.username === config.my_screen_name) {
        Log.e("For safety, passing same as my_screen_name or blank username is prohibited.")
        process.exit(-1)
      }

      Log.n("Sanity check is okay")
      client.get(listSource, {screen_name: parsedArgs.username, stringify_ids: true}, (error, data, response) => {
        if (error) {
          Log.e(`Error occured! ${JSON.stringify(error)}`)
          return
        }

        Log.n("Will prepare for punishment")

        const MAX_REQUEST_SIZE: number = 30

        let progressIndicator: Progress = new Progress("Blocking :current/:total [:bar]", { total: data.ids.length, width: 40 })
        let targets: Array<string> = data.ids.filter((id_string) => { return !(id_string in safeList) })
        Log.n("Target length = " + targets.length)
        console.log(targets)
        let blockTaskPromise = (id: string):Promise<*> => {
          return new Promise((resolve, reject) => {
            if (id === undefined || id === "") {
              reject(false)
              return
            }

            // Promise chaining
            client.post("/blocks/create", {user_id : id })
                  .then((error) => {
                    progressIndicator.tick()
                    setTimeout(() => { resolve(true) }, 300)
                  })
                  .catch((error) => {
                    Log.e(error + ":" + id)
                    reject(false)
                  })
          })
        }

        if (targets.length > 0) {
          let promise: Promise<*> = blockTaskPromise(targets.shift())
          for  (let i=0; i < targets.length; i++) {
            promise = promise.then(() => { blockTaskPromise(targets.shift()) })
          }
        }
      })
    })
  }
  else {
    Log.e("Bird could not load configuration from neither system environment nor configuration file")
    Log.e("Here is what Bird got:", JSON.stringify(config))
    process.exit(-1)
  }
}

// -------------------------------------------
if (typeof(process.argv) === "object") {
  main(process.argv)
}
else {
  Log.e("Please call this program via OS shell.")
  process.exit(-1)
}
