/*
* HlugWebScraper
* 
*
* Copyright (c) 2014 Vincent Elliott Wagner
* Licensed under the MIT license.
*/
'use strict';

var request = require('request');
var cheerio = require('cheerio');
var Q = require('q');

exports.rooturl = 'http://badeseen.hlug.de';
exports.mapurl = 'http://badeseen.hlug.de/karte.html';
exports.scrapelakes = 'all';

function parseDate(input) {
    var parts = input.match(new RegExp('(\\d+)','g'));
    return new Date(parts[2], parts[1]-1, parts[0]);
}

function processOpenDate(lake, $){
    var rawperiod = $('th:contains(\'Badesaison:\')').next().children().first().text();
    var openFrom = parseDate(rawperiod.substring(4,14));
    var openTo = parseDate(rawperiod.substring(19,29));
    lake.openFrom = openFrom;
    lake.openTo = openTo;
    return lake;
}

function requestQ(url) {
    var deferred = Q.defer();
    request(url,function(error, response,html){
        if(error){
            deferred.reject(error);
        }else{
            deferred.resolve(html);
        }
    });   
    return deferred.promise;
}

function processLakeProfileQ(lakeprofilelink,lake){
    return requestQ(lakeprofilelink)
    .then(function(html){
        var lakebind = lake;
        var $ = cheerio.load(html);

        var images = [];
        $('.hidden-print #more-images div.detailimg').filter(function(){
            var div = $(this);
            var link =  exports.rooturl + div.children().eq(0).attr('href');
            var copyright =  exports.rooturl + div.children().eq(2).text();

            var image = {
                'src': link,
                'copyright': copyright
            };
            images.push(image);
        });

        lakebind.images = images;

        var table = $('table.messdaten tr');
        lakebind.city = table.eq(2).children().eq(1).text();
        lake.heightAboveSeaLevel = parseInt(table.eq(3).children().eq(1).text());
        lake.areaHa = parseFloat(table.eq(4).children().eq(1).text().replace(',','.'));
        lake.depthMax = parseFloat(table.eq(5).children().eq(1).text().replace(',','.'));
        lake.depthAvg = parseFloat(table.eq(6).children().eq(1).text().replace(',','.'));
        lakebind.lakeType = table.eq(7).children().eq(1).text();
        lakebind.extracurricularActivity = table.eq(8).children().eq(1).text().split(',').map(function(s){
            return s.trim();
        });
        lakebind.blueGreenAlgeaRisk = table.eq(9).children().eq(1).text();
        var operatortemp = table.eq(11).children().eq(1).html().split('<br>');
        lakebind.operator = {
            'name': $('<textarea />').html(operatortemp[0]).text(),
            'street': $('<textarea />').html(operatortemp[1]).text(),
            'zipcodeCity': $('<textarea />').html(operatortemp[2]).text(),
            'email': table.eq(12).children().eq(1).text(),
            'telephone': table.eq(13).children().eq(1).text(),
            'fax': table.eq(14).children().eq(1).text(),
            'website': table.eq(15).children().eq(1).text()
        };
        lakebind.appropriateAuthority = {
            'name': table.eq(17).children().eq(1).text(),
            'address': table.eq(18).children().eq(1).text(),
            'addressAdditional': table.eq(19).children().eq(1).text(),
            'street': table.eq(20).children().eq(1).text(),
            'zipcodeCity': table.eq(21).children().eq(1).text(),
            'telephone': table.eq(22).children().eq(1).text()
        };
        return lakebind;
    });
}

function processLakeMeasurementsQ(measurementurls, result){
    var measurementurl =  measurementurls.pop();
    var resultbind = result || [];
    if(typeof(measurementurl) !== 'undefined'){
        return requestQ(measurementurl)
        .then(function(html){
            var $ = cheerio.load(html);
            $('table.messdaten tr:not(:first-child)')
            .filter(function(){
                var row = $(this);
                var date = parseDate(row.children().eq(0).text());
                var waterTemperature = parseInt(row.children().eq(1).text()) || null;
                var enterococci = row.children().eq(2).text();
                var escherichiaColi = row.children().eq(3).text();
                var classname = row.children().eq(4).attr('class');
                var rating = parseInt(classname.substring(classname.length-1)) || 0;
                var comment = row.children().eq(5).text();
                var measurement = {
                    'date': date,
                    'waterTemperature': waterTemperature,
                    'enterocsocci' : enterococci,
                    'escherichiaColi': escherichiaColi,
                    'rating': rating,
                    'comment': comment
                };
                resultbind.push(measurement);
            });
        })
.then(function(){
    return processLakeMeasurementsQ(measurementurls,resultbind); 
});
}else{
    return resultbind;
}
}

function processLakeRatingQ(ratingurls, result){
    var ratingurl = ratingurls.pop();
    var resultbind = result || [];
    if(typeof(ratingurl) !== 'undefined'){
        return requestQ(ratingurl)
        .then(function(html){
            var $ = cheerio.load(html);
            var image = $('table.einstufung tr:nth-child(2) td img');
            var imagesrc = image.attr('src');
            var regex = new RegExp('einstufung(\\d)');
            regex.exec(imagesrc);
            var rating = parseInt(RegExp.$1);
            var year = $('ul.pagination.hidden-print').last().find('li.active a').text();

            var ratingobj = {
                'year': year,
                'rating': rating
            };
            resultbind.push(ratingobj);
        })
        .then(function(){
            return processLakeRatingQ(ratingurls,resultbind);
        });
    }else{
        return resultbind;
    }
}

function processLakeData(lakes, result){
    var lakebind = lakes.pop();
    var resultbind = result || [];
    var $;
    if(typeof(lakebind) !== 'undefined'){
        console.log('processing lake: ' + lakebind.name);
        return requestQ(lakebind.hlugurl).then(function(html){
            $ = cheerio.load(html);
            if($('.detaillink:contains(\'Zurück zur Übersicht\')').length > 0){
                console.log('measurepage and detailpage are swapped for lake ' + lakebind.name);
                lakebind.hlugurl = exports.rooturl + $('.detaillink:contains(\'Zurück zur Übersicht\')"').attr('href');
            }
            return lakebind.hlugurl;
        })
        .then(requestQ)
        .then(function(html){
            $ = cheerio.load(html);
            lakebind = processOpenDate(lakebind,$);
            lakebind.introtext = $('div.tx-hlug-badeseen > div:nth-child(5) > p').text();
            var measurmentyearurls = [];
            $('ul.pagination.hidden-print').first().find('li').filter(function(){
                var obj = $(this).children().first();
                measurmentyearurls.push(exports.rooturl + obj.attr('href'));
            });
            return measurmentyearurls;
        })
        .then(processLakeMeasurementsQ)
        .then(function(measurements){
            var flatmeasurement = measurements.reduce(function(previous,next){
                return previous.concat(next);
            },[]);
            flatmeasurement.sort(function(a,b){
                return b.date - a.date;
            });
            lakebind.measurements = flatmeasurement;

            var ratingurls = [];
            $('ul.pagination.hidden-print').last().find('li').filter(function(){
                var obj = $(this).children().first();
                ratingurls.push(exports.rooturl + obj.attr('href'));
            });
            return ratingurls;
        })
        .then(processLakeRatingQ)
        .then(function(ratings){
            var sortedratings = ratings.sort(function(a,b){
                return (a.year<b.year?-1:(a.year>b.year?1:0));
            });
            lakebind.yearratings = sortedratings;
            var lakeprofile = exports.rooturl + $('a.detaillink').attr('href');
            return lakeprofile;
        })
        .then(function(lakeprofile){
            return processLakeProfileQ(lakeprofile,lakebind);            
        }) 
        .catch(function(error){
            throw error + ' occurred while parsing lake ' + lakebind.name;
        })
        .then(function(lake){
            resultbind.push(lake);
            return processLakeData(lakes,resultbind); 
        });
    }else{
        return resultbind;
    }
}

exports.scrapeHLUGBadeseen = function(callback){
    requestQ(exports.mapurl)
    .then(function(html){
        var lakes = [];
        var methodregexp = new RegExp('mapMarker\(([^)]*)\)','gm'); // jshint ignore:line
        var match;
        while ((match = methodregexp.exec(html)) !== null){
            var method = match[0];
            var args = method.split(',');
            var fielddata = args[9].replace(/\\/g,'');
            var $ = cheerio.load(fielddata);
            var url = $('a').attr('href');
            var name = $('a').text().trim();
            var lake = {
                'name': name,
                'hlugurl': exports.rooturl + url,
                'latitude': args[2],
                'longitude': args[3]
            };
            lakes.push(lake);
        }
        return lakes;
    })
    .then(function(lakes){
        if(exports.scrapelakes !== 'all'){
            return lakes.slice(0,exports.scrapelakes);
        }
        return lakes;
    })
    .then(processLakeData)
    .nodeify(callback);  
};
