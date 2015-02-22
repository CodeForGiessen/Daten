#!/usr/bin/node
'use strict';

var fs = require('q-io/fs');
var program = require('commander');
var scraper = require('./..');

program
    .version('0.0.1')
    .description('creates a new mapping for hlug lakes')
    .option('-m --mapping <file>', 'Mapping file')
    .option('-f --file <file>', 'Outputfile')
    .option('-c --compress', 'Minfify')
    .parse(process.argv);

// set default file
program.file = program.file || 'badeseen.json';
program.compress =  program.compress || false;

fs.read(program.mapping)
.catch(function(){
    console.log('Mappingfile cannot be read');
})
.then(function(data){
    var mapping = JSON.parse(data);
    return scraper.scrapeHLUGBadeseenQ(mapping);
})
.then(function(lakes){
    var content;
    if(program.compress){
        content = JSON.stringify(lakes);
    }else{
        content = JSON.stringify(lakes,null,4);
    }
    return fs.write(program.file,content,{
        encoding: 'utf8'
    });
})
.catch(function(e){
    console.log('Error: ' + e);
});
