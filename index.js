'use strict';

var argv = require('optimist').argv;
var fs = require('fs');
var path = require('path');
var winston = require('winston');
var moment = require('moment');
var sqlite = require('sqlite3').verbose();
var request = require('superagent');

var config = require('./config');

var root = "https://hacker-news.firebaseio.com/v0/";
var whoIsHiringAlgoliaSearchUrl = 'http://hn.algolia.com/api/v1/search?query=who+is+hiring';

var db = new sqlite.Database(config.database);

var validStory = null;
var month;

if (!argv.output) {
  winston.info("Usage: node " + path.basename(__filename) + " --output=OUTPUT_FILE");
  process.exit(1);
}

if (argv.month && argv.month.match(/[a-z]+ \d{4}/i)) {
  month = argv.month; 
} else {
  month = getCurrentMonthAndYear();
}

function getWhoIsHiringStories(callback) {
  request.get(whoIsHiringAlgoliaSearchUrl)
    .end(function(err, resp) {
      if (err) return callback(err);
      var output = '';
      resp.body.hits.forEach(function(sr) {
        if (sr.title.match("Who is hiring") && sr.title.match(month)) {
          output = sr.objectID;
        }
      });
      if (output === '') {
        return callback(new Error(`'Who is hiring' thread not found for ${month}`));
      }
      return callback(null, output);
    });
}

function getWhoIsHiringComments(id, callback) {
  winston.info("Getting ask story: " + id);
  request.get(root + "item/" + id + ".json")
    .end(function(err, response) {
      if (err) return callback(err);
      if (response.body.title.match("Who is hiring")) {
        validStory = response.body;
        // we got the latest 'Who is Hiring' topic so whe can analyze comments
        return getStoryComments(response.body, callback);
      } else {
        winston.info("Skipping story: " + response.body.title);
        return callback(new Error('No Hiring Story'));
      } 
      
    });
}

function getStoryComments(story, callback) {
  winston.info("Getting comments for story " + story.id);
  request.get(root + "item/" + story.id + ".json")
    .end(function(err, response) {
      if (err) return callback(err);
      return callback(null, response.body.kids);
    });
}

getWhoIsHiringStories(onStoryRetrieved);

function onStoryRetrieved(err, resp) {
  if (err) {
    return winston.error(err.message);
  }
  getWhoIsHiringComments(resp, function(err, comments) {
    if (err) {
      if (err.message == 'No Hiring Story') {
        // Switch to next story;
          return winston.error('No ASK Stories found, sorry!');
      }
      throw err;
    } else {
      winston.info("Grabbed " + comments.length + " comments");
      return getRemoteJobOffers(comments, function(err, stories) {
        if (err) throw err;
        stories.forEach(function(story) {
          return storePost(story);
        });
        return generateHTML();
      });
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
            winston.info(resp.body);
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
  
function getCurrentMonthAndYear() {
  var today = moment().format('MMMM YYYY');
  return today;
}

function generateHTML() {
  var output = "<html><head>"
  output += "<title>" + validStory.title + "</title>";
  output += "</head><body>";
  output += "<h1>" + validStory.title + " - ONLY REMOTE! </h1>";
  db.each(`SELECT * FROM stories WHERE month = '${month}'`, function(err, row) {
    output += `
<hr>
<h3>${row.title}</h3>
<p>${row.body}</p>
    `;
  }, function() {
    output += "</body></html>";  
    var ws = fs.createWriteStream(argv.output);
    var buf = new Buffer(output);
    ws.write(buf);
    ws.end();
    winston.info('Output file created!');  
  });
  
}

function storePost(data) {
  const story_id = data.id;
  const author = data.by;
  var body = data.text;
  var title = 'NO TITLE';
  const pIndex = data.text.indexOf('<p>');
  if (pIndex !== -1) {
    title = data.text.substr(0, pIndex);
    body = data.text.substr(pIndex + 3);
  }
  db.run(`INSERT INTO stories (story_id, month, author, body, title) VALUES
    (${story_id}, '${month}', '${author}', '${body}', '${title}')`, function(err) {
      if (err) {
        if (err.code === 'SQLITE_CONSTRAINT') {
          winston.warn(`Duplicate entry found: ${story_id}`);
        } else {
          winston.error(`Error storing post: ${err.message}`);
        }
      }
    });
}