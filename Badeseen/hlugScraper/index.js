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
var q = require('q');
var _ = require('lodash');

exports.rooturl = 'http://badeseen.hlug.de';
exports.mapurl = 'http://badeseen.hlug.de/karte.html';
exports.scrapelakes = 'all';
// exports.scrapelakes = 1;
exports.activityMapping = {
    'Angelsport' : 'ANGELSPORT',
    'Baden': 'BADEN',
    'Sporttauchen': 'SPORTTAUCHEN',
    'Wasserski': 'WASSERSKI',
    'Segeln': 'SEGELN',
    'Windsurfen': 'WINDSURFEN',
    'Wassersport': 'WASSERSPORT'
};
exports.openWeatherMapApiKey = process.env.OPENWEATHERMAPAPI_KEY;
exports.openWeatherMaxRetries = 5;

exports.mappingStats = {
    status: 'OK',
    mappingExistsButLakeNotFound: [],
    lakeExistsButMappingNotFound: []
};


function parseDate(input) {
    var parts = input.match(new RegExp('(\\d+)','g'));
    if(parts && parts.length === 3){
        return new Date(parts[2], parts[1]-1, parts[0]);
    }else{
        return null;
    }
}

function getOpenDates($){
    var rawperiod = $('th:contains(\'Badesaison:\')').next().children().first().text();
    var openFrom = parseDate(rawperiod.substring(4,14));
    var openTo = parseDate(rawperiod.substring(19,29));
    return {
        openFrom: openFrom,
        openTo: openTo
    };
}

function requestQ(url) {
    var deferred = q.defer();
    request(url,function(error, response, html){
        if(error){
            deferred.reject(error);
        }else{
            deferred.resolve([response,html]);
        }
    });
    return deferred.promise;
}

function requestRetryQ(requestObj, retries){
    var deferred = q.defer();
    var tries = 0;
    var lastRequestPromise = q();
    var retry = function(){
        tries++;
        lastRequestPromise
        .then(function(){
            return requestQ(requestObj)
            .spread(function(response,html){
                if(response.statusCode >= 500 && response.statusCode < 600 ){
                   console.log('retry due to ' + response.statusCode + ' error: ' + requestObj.url);
                    if(tries >= retries){
                        deferred.reject('too many retries');
                    }else{
                        retry();
                    }
                }else{
                    deferred.resolve([response,html]);
                }
            })
            .catch(function(err){
                if(tries >= retries){
                    deferred.reject('too many retries caused of: ' + err);
                }else{
                    retry();
                }
            });
        });
    };
    retry();
    return deferred.promise;
}
var printOne = false;
function getOpenWeatherMapUrl(city){
     var url = 'http://api.openweathermap.org/data/2.5/weather?q=' + encodeURIComponent(city) + ',de&units=metric';
    if(exports.openWeatherMapApiKey){
        url+= '&APPID='+ exports.openWeatherMapApiKey;
    }else{
        if(!printOne){
            console.warn('Please define OPENWEATHERMAPAPI_KEY! Using test / develop mode of api.  Api could reject requests');
            printOne = true;
        }
    }
    return url;
}

function getWeatherQ(city){
    var url =  getOpenWeatherMapUrl(city);
    return requestRetryQ({
        url: url,
        json: true
    }, exports.openWeatherMaxRetries)
    .spread(function(response, html){
        return{
            openWeatherCityId: html.id,
            current: {
                weather: html.weather,
                temp: html.main.temp,
                temp_min: html.main.temp_min,
                temp_max: html.main.temp_max,
                humidity: html.main.humidity,
                pressure: html.main.pressure,
                wind: html.wind,
                clouds: html.clouds,
                lastUpdated: new Date(html.dt * 1000)
            }
        };
    });
}

function getHlugUrlsByParsingMap(){
    return requestQ(exports.mapurl)
    .spread(function(response,html){
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
    });
}
exports._getHlugUrlsByParsingMap = getHlugUrlsByParsingMap;

function filterMeasurementComment(comment){
    var filterComments = [
    /^o\.?b\.?$/i,
    /^(keine|keien) Auff.ll?ig?keiten$/i,
    /^keine$/i,
    /^ohne Beanstandung$/i,
    /^o\.?$/i,
    /^-$/i,
    /^Sichtkontrolle: Keine Auff(.)lligkeiten$/i
    ];
    var result = comment.trim();

    filterComments.forEach(function(regex){
        if(regex.test(result)){
            result = '';
        }
    });
    return result;
}

function filterTelephoneNumber(rawTelephone){
    var filterComments = [
    /---/i,
    /---/i
    ];
    var result = rawTelephone.trim();

    filterComments.forEach(function(regex){
        if(regex.test(result)){
            result = '';
        }
    });
    return result;
}

exports._filterMeasurementComment = filterMeasurementComment;

function fixEncodingErrorsComment(comment){
    var result = comment;
    result = result.replace(/Zus\?tzliche/g,'Zusätzliche');
    result = result.replace(/zur\?ckgegangen/g,'zurückgegangen');
    result = result.replace(/schw\?l/g,'schwül');
    result = result.replace(/Algenbl\?te/g,'Algenblüte');
    result = result.replace(/hei\?es/g,'heißes');
    result = result.replace(/unbest\?ndiges/g,'unbeständiges');
    result = result.replace(/Niederschl\?ge/g,'Niederschläge');
    result = result.replace(/w\?hrend/g,'während');
    return result;
}


function processLakeMeasurementQ(url){
    var result = [];
    return requestQ(url)
    .spread(function(response,html){
        var $ = cheerio.load(html);
        $('table.messdaten tr:not(:first-child)')
        .each(function(){
            var row = $(this);
            var date = parseDate(row.children().eq(0).text());
            var waterTemperature = parseInt(row.children().eq(1).text()) || null;
            var enterococci = row.children().eq(2).text();
            var escherichiaColi = row.children().eq(3).text();
            var classname = row.children().eq(4).attr('class');
            var rating = parseInt(classname.substring(classname.length-1)) || 0;
            var comment = row.children().eq(5).text();
            comment = fixEncodingErrorsComment(filterMeasurementComment(comment));

            result.push({
                'date': date,
                'waterTemperature': waterTemperature,
                'enterocsocci' : enterococci,
                'escherichiaColi': escherichiaColi,
                'rating': rating,
                'comment': comment
            });
        });
    })
    .then(function(){
        return result;
    });
}

function processLakeRatingQ(url){
    return requestQ(url)
    .spread(function(response,html){
        var $ = cheerio.load(html);
        var image = $('table.einstufung tr:nth-child(2) td img');
        var imagesrc = image.attr('src');
        var regex = new RegExp('einstufung(\\d)');
        regex.exec(imagesrc);
        var rating = parseInt(RegExp.$1);
        var year = $('ul.pagination.hidden-print').last().find('li.active a').text();

        return {
            'year': year,
            'rating': rating
        };
    });
}

function mapExtraCurricularActivities(activitiesRaw){
    var result = [];
    activitiesRaw.forEach(function(activityRaw){
        var activity = exports.activityMapping[activityRaw.trim()];
        if(activity){
            result.push(activity);
        }else{
            console.warn('no mapping for ' + activityRaw + ' ignore it');
        }
    });
    return result;
}

function processLakeProfileQ(url){
    return requestQ(url)
    .spread(function(response,html){
        var result = {};
        var $ = cheerio.load(html);

        var images = [];
        $('.hidden-print #more-images div.detailimg').each(function(){
            var div = $(this);
            var link =  exports.rooturl + div.children().eq(0).attr('href');
            var copyright =  exports.rooturl + div.children().eq(2).text().trim();

            var image = {
                'src': link,
                'copyright': copyright
            };
            images.push(image);
        });

        result.images = images;

        var table = $('table.messdaten tr');
        result.city = table.eq(2).children().eq(1).text();
        result.heightAboveSeaLevel = parseInt(table.eq(3).children().eq(1).text().trim());
        result.areaHa = parseFloat(table.eq(4).children().eq(1).text().replace(',','.'));
        result.depthMax = parseFloat(table.eq(5).children().eq(1).text().replace(',','.'));
        result.depthAvg = parseFloat(table.eq(6).children().eq(1).text().replace(',','.'));
        result.lakeType = table.eq(7).children().eq(1).text().trim();
        result.extracurricularActivity =  mapExtraCurricularActivities(table.eq(8).children().eq(1).text().split(','));
        result.blueGreenAlgeaRisk = table.eq(9).children().eq(1).text();
        var operatortemp = table.eq(11).children().eq(1).html().split('<br>');
        result.operator = {
            'name': $('<textarea />').html(operatortemp[0]).text().trim(),
            'street': $('<textarea />').html(operatortemp[1]).text().trim(),
            'zipcodeCity': $('<textarea />').html(operatortemp[2]).text().trim(),
            'email': table.eq(12).children().eq(1).text().trim(),
            'telephone': filterTelephoneNumber(table.eq(13).children().eq(1).text().trim()),
            'fax': filterTelephoneNumber(table.eq(14).children().eq(1).text().trim()),
            'website': table.eq(15).children().eq(1).text().trim()
        };
        result.appropriateAuthority = {
            'name': table.eq(17).children().eq(1).text().trim(),
            'address': table.eq(18).children().eq(1).text().trim(),
            'addressAdditional': table.eq(19).children().eq(1).text().trim(),
            'street': table.eq(20).children().eq(1).text().trim(),
            'zipcodeCity': table.eq(21).children().eq(1).text().trim(),
            'telephone': table.eq(22).children().eq(1).text().trim()
        };
        var generalInformation =  $('a:contains(\'Badegewässerprofil\')').eq(0).attr('href') || null;
        var landUseMap =  $('a:contains(\'Flächennutzung\')').eq(0).attr('href') || null;
        var bathymetricChart =  $('a:contains(\'Tiefenkarte\')').eq(0).attr('href') || null;

        result.downloads = {
            'bathymetricChart':bathymetricChart,
            'landUseMap': landUseMap,
            'generalInformation': generalInformation
        };
        return result;
    });
}

function getMessages($){
    var result = [];
    $('div.message-notice').each(function(){
        var obj = $(this);
        var date = parseDate(obj.children('strong').eq(0).text());
        var text = '';
        obj.children('p').each(function(){
            text +=$(this).text() + ' ';
        });
        text = text.trim();
        result.push({
            'date': date,
            'message': text
        });
    });
    result.sort(function(a,b){
        return b.date - a.date;
    });
    return result;
}

function getBathingPermission($){
    var permission = $('th:contains(\'Badefreigabe:\')').next().children().first().text();
    return permission.trim();
}


function processLakeQ(lake){
    var result = lake;
    var $;
    return requestQ(lake.hlugurl)
    .spread(function(response,html){
        console.log('processing lake: ' + lake.name);
        $ = cheerio.load(html);
        if($('.detaillink:contains(\'Zurück zur Übersicht\')').length > 0){
            console.log('measurepage and detailpage are swapped for lake ' + lake.name);
            result.hlugurl = exports.rooturl + $('.detaillink:contains(\'Zurück zur Übersicht\')').attr('href');
        }
        return result.hlugurl;
    })
    .then(requestQ)
    .spread(function(response,html){
        $ = cheerio.load(html);
        result = _.extend(result,getOpenDates($));
        result.messages = getMessages($);
        result.bathingPermission = getBathingPermission($);
        result.introtext = $('div.tx-hlug-badeseen > div:nth-child(5)').text().trim();
        var measurmentyearurls = [];
        $('ul.pagination.hidden-print').first().find('li').each(function(){
            var obj = $(this).children().first();
            measurmentyearurls.push(exports.rooturl + obj.attr('href'));
        });
        return q.all(measurmentyearurls.map(function(url){
            return processLakeMeasurementQ(url);
        }))
        .then(function(measurementsRaw){
            var flatten = _.flatten(measurementsRaw);
            flatten.sort(function(a,b){
                return b.date - a.date;
            });
            return flatten;
        });

    })
    .then(function(measurements){
        result.measurements = measurements;
        var ratingurls = [];
        $('ul.pagination.hidden-print').last().find('li').each(function(){
            var obj = $(this).children().first();
            ratingurls.push(exports.rooturl + obj.attr('href'));
        });
        return q.all(ratingurls.map(function(url){
            return processLakeRatingQ(url);
        }))
        .then(function(ratings){
            ratings.sort(function(a,b){
                return (a.year<b.year?-1:(a.year>b.year?1:0));
            });
            return ratings;
        });
    })
    .then(function(ratings){
        result.yearratings = ratings;
        var lakeprofile = exports.rooturl + $('a.detaillink').attr('href');
        return processLakeProfileQ(lakeprofile);
    })
    .then(function(profile){
        result = _.extend(result,profile);
        return getWeatherQ(result.city);
    })
    .then(function(weather){
        result.weather = weather;
    })
    .then(function(){
        console.log('processing finished: ' + lake.name);
        return result;
    });
}

exports._processLakeQ = processLakeQ;

function getLakesWithId(lakes,mapping){
    var status = 'OK';
    var mappingExistsButLakeNotFound = [];
    var lakeExistsButMappingNotFound = [];

    var result = [];
    var mappingUsed = [];

    lakes.forEach(function(lake){
        var id = mapping[lake.name];
        if(id){
            lake._id = id;
            result.push(lake);
            mappingUsed.push(lake.name);
        }else{
            lakeExistsButMappingNotFound.push(lake);
        }
    });

    mappingExistsButLakeNotFound = _.difference(_.keys(mapping),mappingUsed);

    if(mappingExistsButLakeNotFound.length !== 0 || lakeExistsButMappingNotFound.length !== 0){
        status = 'ERROR';
    }

    exports.mappingStats = {
        status: status,
        mappingExistsButLakeNotFound: mappingExistsButLakeNotFound,
        lakeExistsButMappingNotFound: lakeExistsButMappingNotFound
    };
    return result;
}

exports.scrapeHLUGBadeseenQ = function(mappingParam){
    var mapping = mappingParam || {};
    return getHlugUrlsByParsingMap()
    .then(function(lakes){
        lakes = getLakesWithId(lakes,mapping);
        if(exports.scrapelakes !== 'all'){
            return lakes.slice(0,exports.scrapelakes);
        }
        return lakes;
    })
    .then(function(lakes){
        return q.all(lakes.map(function(lake){
            return processLakeQ(lake);
        }));
    });
};
