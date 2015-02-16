'use strict';


var scraper = require('../');
var fs = require('fs');

// scraper.scrapelakes = 1;
scraper.scrapeHLUGBadeseen(function(error,lakes){
    if(error === null){
        fs.writeFile('badeseen.json', JSON.stringify(lakes,null,4));
        fs.writeFile('badeseen.min.json', JSON.stringify(lakes));
    }else{
        console.error(error);
    }
});
