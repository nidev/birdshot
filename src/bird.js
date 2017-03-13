// @flow

const Twitter = require("twitter")
const Fs = require("fs")
const Argparse = require("argparse")
const Progress = require("progress")

const SafeListPromise = require("./promise/safelist")
const Log = require("./log")
const Config = require("./config")

const ENV_TWITTER_TOKEN_NAMES:Object = {
  "BIRD_COMSUMER_KEY":"consumer_key",
  "BIRD_CONSUMER_SECRET":"consumer_secret",
  "BIRD_ACCESS_TOKEN_KEY": "access_token_key",
  "BIRD_ACCESS_TOKEN_SECRET" : "access_token_secret",
  "BIRD_MY_SCREEN_NAME" : "my_screen_name"
}

class BirdClient {
  client: Twitter
  config: Config
  progressIndicator: Progress
  safeList: Object
  cursorNumString: string
  multipleRunners: number

  constructor() {
    this.progressIndicator = new Progress("Blocking :current/:total [:bar]", { total: 0, width: 80 })
  }

  doBlock(dequeuer: Function): void {
    let targetUserId: string = dequeuer()

    if (!targetUserId) {
      return
    }

    this.client.post("/blocks/create", {user_id : targetUserId, skip_status: "true", include_entities: "false" })
      .then((error, data, response) => {
        this.progressIndicator.tick()
        this.doBlock(dequeuer)
      })
      .catch((e) => {
        Log.e(`Error caught while blocking ${targetUserId}`)
        console.log(e)

        if (e[0] && e[0].code == "48") {
          Log.e(`API Error. Try with '-C ${this.cursorNumString}' or '--cursor ${this.cursorNumString}' later.`)
          process.exit(-1)
        }

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
        this.fetchList(sourceAPI, fromScreenName, data.next_cursor_str)
      }

      let targets: Array<string> = data.ids.filter((id_string) => { return !(id_string in this.safeList) })

      this.progressIndicator.total += targets.length

      Log.n("Target length = " + targets.length)

      let dequeuer: Function = () => { return targets.length > 0 ? targets.shift() : "" }

      if (targets.length > 0) {
        for (let i = 0; i < this.multipleRunners; i++) {
          // More execution will create more simultaneously running context.
          this.doBlock(dequeuer, data.next_cursor_str)
        }
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
    parser.addArgument(["-C", "--cursor"], { help : "Start from given cursor, if previous operation was stopped accidentally. (Default: -1)", default: "-1" })
    parser.addArgument(["-x", "--multiplier"], { help : "Send block request with multiple connection. (Default: 4, Max: 32)", default: "4" })

    let parsedArgs: Object = parser.parseArgs()
    let safeListPromise: SafeListPromise = new SafeListPromise()
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

        this.multipleRunners = 2

        if (parsedArgs.multiplier) {
          try {
            this.multipleRunners = Number.parseInt(parsedArgs.multiplier)|0

            if (this.multipleRunners <  4 && this.multipleRunners > 32) {
              throw "Minimum multiplier is 4 and also Do not exceed 32."
            }
          }
          catch (e) { Log.e(e) }
        }

        let cursor: number = -1

        if (parsedArgs.cursor) {
          try {
            cursor = Number.parseInt(parsedArgs.cursor)|0

            if (cursor < 0) {
              throw "No negative number"
            }
          }
          catch (e) {}
        }

        Log.n(`Execution context set up. Task multiplier x${this.multipleRunners}`)
        this.fetchList(listSource, parsedArgs.username, cursor.toString())
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
