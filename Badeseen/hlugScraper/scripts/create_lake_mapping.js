#!/usr/bin/node
'use strict';

var fs = require('q-io/fs');
var program = require('commander');
var scraper = require('./..');
var mongoose = require('mongoose');

program
    .version('0.0.1')
    .description('creates a new mapping for hlug lakes')
    .option('-f --file <file>', 'Output file')
    .parse(process.argv);

// set default file
program.file = program.file || 'lakeMapping.json';

scraper._getHlugUrlsByParsingMap()
.then(function(lakes){
    var mapping = {};
    lakes.forEach(function(lake){
        mapping[lake.name] = mongoose.Types.ObjectId();

    });
    return fs.write(program.file,JSON.stringify(mapping,null,4),{
        encoding: 'utf8'
    });
})
.catch(function(err){
    console.log('Error: ' + err);
});



