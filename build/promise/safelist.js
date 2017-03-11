const Fs = require("fs");
const Log = require("../log");

class SafeListPromise extends Object {

  loadFile(dataFileName) {
    return new Promise((resolve, reject) => {
      Log.n("Reading SafeList file");
      Fs.stat(dataFileName, (err, stat) => {
        if (stat.isFile()) {
          // TODO: read and load
          Fs.readFile(dataFileName, "utf-8", (error, data) => {
            Log.n("Read. Parsing now");
            if (error) {
              reject(`Error while reading file ${ dataFileName } : ${ error.toString() }`);
              return;
            }

            var safeListTable = {};
            let lines = data.split(/\s+/);
            let count = 0;
            for (let line of lines) {
              count++;
              safeListTable[line.replace(/[^0-9]]+/, "")] = 0;
            }
            Log.n(`Copied IDs. Total: ${ count }`);
            resolve(safeListTable);
          });
        } else {
          reject(`File not exists : ${ dataFileName || 'null' }`);
          Log.e(`File not exists : ${ dataFileName || 'null' }`);
        }
      });
    });
  }

  fetchFromTwitterProfile(client, fromScreenName) {
    return new Promise(function (resolve, reject) {
      Log.n("Fetching friends of your twitter account to create SafeList");

      client.get("/friends/ids", { screen_name: fromScreenName, stringify_ids: true }, (error, tweets, response) => {
        //console.log(error)
        var safeListTable = {};
        if (!error) {
          let count = 0;
          for (let id of tweets.ids) {
            safeListTable[id] = 0;
            count++;
          }
          Log.n(`Copied IDs. Total: ${ count }`);
          resolve(safeListTable);
        } else {
          reject(safeListTable);
        }
      });
    });
  }
}

module.exports = SafeListPromise;