#!/usr/bin/env node

'use strict';

const sqlite = require('sqlite3');
const config = require('../config');
const db = new sqlite.Database(config.database);

db.run(`CREATE TABLE IF NOT EXISTS stories (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  story_id INT NOT NULL,
  month CHAR(50) NOT NULL,
  author CHAR(255) NOT NULL,
  body TEXT NOT NULL,
  title CHAR(1024) NOT NULL
)`, function() {
  db.run(`CREATE UNIQUE INDEX unique_story_id ON stories (story_id)`);  
});
