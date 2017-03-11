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

  fetchFromTwitterProfile(client:Twitter, fromScreenName: string) : Promise<*> {
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

class BirdClient {
  client: Twitter
  config: Config
  progressIndicator: Progress
  safeList: Object

  constructor() {
    this.progressIndicator = new Progress("Blocking :current/:total [:bar]", { total: 0, width: 80 })
  }

  doBlock(dequeuer: Function): void {
    let targetUserId: string = dequeuer()

    this.client.post("/blocks/create", {user_id : targetUserId, skip_status: "true", include_entities: "false" })
      .then((error, data, response) => {
        this.progressIndicator.tick();

        this.doBlock(dequeuer)
      })
      .catch((e) => {
        Log.e(`Error caught while blocking ${targetUserId} : ${e.toString()}`)

        this.doBlock(dequeuer)
      })
  }

  fetchList(sourceAPI: string, fromScreenName: string, cursorNumString: string = "-1"): void {
    let params: Object = {screen_name: fromScreenName, stringify_ids: true, cursor: cursorNumString}

    this.client.get(sourceAPI, params, (error, data, response) => {
      if (error) {
        Log.e(`Error occurred while fetching IDs: ${JSON.stringify(error)}`)
        return
      }

      // If response indicates more page(s), call fetchList again.
      if (data.next_cursor_str !== "0") {
        this.fetchList(sourceAPI, fromScreenName, data.next_cursor_str);
      }

      let targets: Array<string> = data.ids.filter((id_string) => { return !(id_string in this.safeList) })
      Log.n("Target length = " + targets.length)

      this.progressIndicator.total += targets.length

      let dequeuer: Function = () => { return targets.length > 0 ? targets.shift() : "" }

      if (targets.length > 0) {
        this.doBlock(dequeuer);
      }
    })
  }

  main(args: Array<string>): void {
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
    let safeListPromise: SafeListPromises = new SafeListPromises()
    this.config = new Config()

    Log.n("Processing arguments")

    if (parsedArgs.config) {
      let configFile = (parsedArgs.config:string)
      let jsonConfigData = JSON.parse(Fs.readFileSync(configFile, "utf-8"))
      for (let jsonConfigKey in jsonConfigData) {
        this.config[jsonConfigKey] = jsonConfigData[jsonConfigKey]
      }
    }
    else {
      // Obtain information from Environment variables
      for (let envname:string in ENV_TWITTER_TOKEN_NAMES) {
        this.config[ENV_TWITTER_TOKEN_NAMES[envname]] = process.env[envname]
      }
    }

    let preparationPromises: Array<Promise<*>> = []

    if (this.config.isConfigured()) {
      this.client = new Twitter(this.config)

      if (parsedArgs.safelist) {
        preparationPromises.push(safeListPromise.loadFile(parsedArgs.safelist))
      }
      else {
        preparationPromises.push(safeListPromise.fetchFromTwitterProfile(this.client, this.config.my_screen_name))
      }

      Promise.all(preparationPromises).then((values)=> {
        Log.n("Preparation Completed")

        this.safeList = values[0]

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

        if (parsedArgs.username == "" || parsedArgs.username === this.config.my_screen_name) {
          Log.e("For safety, passing same as my_screen_name or blank username is prohibited.")
          process.exit(-1)
        }

        Log.n("Sanity check is okay")

        this.fetchList(listSource, parsedArgs.username)
      })
    }
    else {
      Log.e("Bird could not load configuration from neither system environment nor configuration file")
      Log.e("Here is what Bird got:", JSON.stringify(this.config))
      process.exit(-1)
    }
  }
}


// -------------------------------------------
if (typeof(process.argv) === "object") {
  new BirdClient().main(process.argv)
}
else {
  Log.e("Please call this program via OS shell.")
  process.exit(-1)
}
