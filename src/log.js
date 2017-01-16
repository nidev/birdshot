// @flow
const Colors = require("colors")

function getTimemarker():string {
  return new Date().toISOString()
}
module.exports.n = function stdout_log_normal (...messages:string[]) {
  console.log("[",Colors.green("LOG"),getTimemarker(),"]", ...messages)
}

module.exports.e = function stdout_log_error(...messages:string[]) {
  console.log("[",Colors.red("ERR"),getTimemarker(),"]", ...messages)
}

module.exports.w = function stdout_log_error(...messages:string[]) {
  console.log("[",Colors.yellow("ALR"),getTimemarker(),"]", ...messages)
}

// alias
module.exports.normal = module.exports.n
module.exports.error = module.exports.e
module.exports.warn = module.exports.w
