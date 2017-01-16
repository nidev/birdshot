# birdShot
Shot a stone(or tons of stones) to hazardous 'birds' on Twitter. Don't waste your time and energy on social network trolls.

## Build
After git clone,

```!shell
$ npm install # installs dependencies
$ cp runconfig.json.example runconfig.json
$ whatever_your_favorite_editor_here runconfig.json
```

To get all required tokens, please take a look on [How to Register a Twitter App in 8 Easy Steps](https://iag.me/socialmedia/how-to-create-a-twitter-app-in-8-easy-steps/)

## Usage
* Blocks followings(aka friends) of Someone_Here
```!shell
$ node build/bird.js -c runconfig.json -u Someone_Here -f
```

* Blocks followers of Someone_Here
```!shell
$ node build/bird.js -c runconfig.json -u Someone_Here -F
```

## 'SafeList' Feature
birdShot has 'SafeList' feature. Your followings(friends) will be saved from the catastrophe.


## Caveats
1. This tool does not block target user. 
2. USE IT AT YOUR OWN RISK, though i've used this tool a lot.

## Contribution
Typing with Flow is strongly recommended. You may open new PR to improve this program.

## Last words
If this tool is helpful to you, it means you've spent a lot of precious time with Twiter. Please do something valuable instead. That's it.
