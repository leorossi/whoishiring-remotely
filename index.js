var argv = require('optimist').argv;
var fs = require('fs');
var path = require('path');
var winston = require('winston');

var request = require('superagent');
var root = "https://hacker-news.firebaseio.com/v0/"

var currentIndex = 0;
var validStory = null;

if (!argv.output) {
  winston.info("Usage: node " + path.basename(__filename) + " --output=OUTPUT_FILE");
  process.exit(1);
}
function getAskStories(callback) {
  var endpoint = "askstories.json";
  request
    .get(root + endpoint)
    .accept('Content-Type', 'application/json')
    .end(function(err, askResponse) {
      if (err) return callback(err);
      return callback(null, askResponse.body);
    });  
}

function getWhoIsHiringComments(id, callback) {
  winston.info("Getting ask story: " + id)
  request.get(root + "item/" + id + ".json")
    .end(function(err, response) {
      if (err) return callback(err);
      if (response.body.title.match("Who is hiring")) {
        validStory = response.body;
        // we got the latest 'Who is Hiring' topic so whe can analyze comments
        return getStoryComments(response.body, callback)
      } else {
        winston.info("Skipping story: " + response.body.title);
        return callback(new Error('No Hiring Story'));
      } 
      
    })
}

function getStoryComments(story, callback) {
  winston.info("Getting comments for story " + story.id);
  request.get(root + "item/" + story.id + ".json")
    .end(function(err, response) {
      if (err) return callback(err);
      return callback(null, response.body.kids);
    });
}

getAskStories(onStoryRetrieved);

function onStoryRetrieved(err, resp) {
  getWhoIsHiringComments(resp[currentIndex], function(err, comments) {
    winston.info("Grabbed " + comments.length + " comments");
    if (err) {
      if (err.message == 'No Hiring Story') {
        // Switch to next story;
        currentIndex++;
        return getAskStories(onStoryRetrieved);
      } else {
        throw err;
      }
    } else {
      return getRemoteJobOffers(comments, function(err, stories) {
        return generateHTML(stories);
      })
    }

  });
};

function getRemoteJobOffers(comments, callback) {

  winston.info("Grabbing info on " + comments.length + " comments");
  var valid = [];
  var analyzed = 0;
  comments.forEach(function(comm) {
    request.get(root + "item/" + comm + ".json")
      .end(function(err, resp) {
        analyzed++;
        if (err) { 
          // Some stories will give me permission denied
        } else {
          if (!resp.body.parent) {
            // winston.info(resp.body);
          } else {
            if (resp.body.parent != validStory.id ) {
              throw new Error('Comment is not for the valid story (' + resp.body.parent + ' != ' + validStory.id + ')');
            }

            if (!resp.body.deleted && resp.body.text.match(/remote/i)) {
              valid.push(resp.body);
            }  
          }
          if (analyzed == comments.length) {
            return callback(null, valid);
          }  
        }
        
      });
  });

  
};
  
function generateHTML(stories) {
  var output = "<html><head>"
  output += "<title>" + validStory.title + "</title>";
  output += "</head><body>";
  output += "<h1>" + validStory.title + " - ONLY REMOTE! </h1>";
  stories.forEach(function(story) {
    output += "<hr>";
    output += story.text;
  });
  output += "</body></html>";  
  var ws = fs.createWriteStream(argv.output);
  var buf = new Buffer(output);
  ws.write(buf);
  ws.end();
  winston.info('Output file created!');
}