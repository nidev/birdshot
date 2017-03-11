// @flow

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

module.exports = Config
