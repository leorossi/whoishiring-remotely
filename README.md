# Who is hiring Remotely?

Grabs [HackerNews](http://news.ycombinator.com)'s  latest "Who is Hiring" story and parse all comments to search which company is hiring remotely.

## Why?
Because I'm currently (June 2015) looking for a remote job and it's hard to parse that page manually, so I created this 15-minutes program to help me remove the comments that don't mention the word "remote"

## Install

`npm install`

## Run
`node index.js --output=OUTPUT_FILE`

A basic HTML File will be generated with only the comments that mention the word "Remote". Sometimes a comment will say "[...] no remote allowed [...]" I'll try to improve the parser!