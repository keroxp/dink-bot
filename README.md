# dink-bot

Auto bump bot for [dink](https://github.com/keroxp/dink)

## Description

dink-bot is bump bot for [dink](https://github.com/keroxp/dink) project. It bumps `modules.json` and `.denov` by comparing latest Deno release and `.denov` value. Generally it shoule be ran in Github Actions as it depends on `GITHUB_TOKEN`. You can also run the bot in your local environment or CI server. 


### .denov file

`.denov` file must be located on the project root and must contain only valid semver release of Deno that is used in the project.

```
v0.23.0
```

### modules.json

Currently dink-bot bump `modules.json` file if it depends on `https://deno.land/std`.

## Github Actions 

See example cron workflow: https://github.com/keroxp/dink/blob/master/.github/workflows/bump.yml

## DISCLAIMER

This is internal tool for @keroxp. It does as follows and use carefully or don't use this.

- Create new commits and push changes to origin's `master` branch with your authority
- Create new pull requests and releases on your repository
