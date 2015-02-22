/*global describe, it */
'use strict';

//jshint -W030
var hlugscraper = require('../');
require('should');
var _ = require('lodash');
var mongoose = require('mongoose');


describe('hlugscraper node module', function () {
    describe('parseMap',function(){
        it('should have some lakes',function(done){
            this.timeout(5000);
            hlugscraper._getHlugUrlsByParsingMap()
            .then(function(lakes){
                lakes.should.not.be.empty;
                lakes.map(function(lake){
                    lake.name.should.not.be.empty;
                    lake.hlugurl.should.not.be.empty;
                    lake.latitude.should.not.be.empty;
                    lake.longitude.should.not.be.empty;
                });
                done();
            })
            .catch(done);
        });
    });
    describe('processLakeQ',function(){
        var lakeraw;
        before(function(done){
            this.timeout(50000);
            hlugscraper._getHlugUrlsByParsingMap()
            .then(function(lakes){
                lakeraw = lakes[0];
                done();
            })
            .catch(done);
        });
        it('should parse a lake',function(done){
            this.timeout(50000);
            hlugscraper._processLakeQ(lakeraw)
            .then(function(lake){
                lake.should.be.an.Object;
                done();
            })
            .catch(done);
        });
        it('should parse a lake with a message', function(done){
            this.timeout(50000);
            var lakeWithMessage = {
                hlugurl: 'http://badeseen.hlug.de/badegewaesser/werra-meissner-kreis/werratalsee-ostufer.html',
                name: 'Werratalsee Ostufer'
            };
            hlugscraper._processLakeQ(lakeWithMessage)
            .then(function(){
                done();
            })
            .catch(done);
        });
    });
    describe('filterMeasurementComment',function(){
        it('should filter nothing',function(){
            var okStrings = ['hallo','dat rockt',''];
            okStrings.map(function(s){
                var filtered = hlugscraper._filterMeasurementComment(s);
                filtered.should.be.exactly(s);
            });
        });
        it('should filter everything',function(){
            var okStrings = ['oB','    o.B   ', 'keine Auff*lligkeiten', 'keine Auffälligkeiten', 'keine Auff?lligkeiten'];
            okStrings.map(function(s){
                var filtered = hlugscraper._filterMeasurementComment(s);
                filtered.should.be.exactly('');
            });
        });
    });

    // describe('scrapeHLUGBadeseenQ',function(){
    //     var mapping = {};
    //     before(function(done){
    //         this.timeout(5000);
    //         hlugscraper._getHlugUrlsByParsingMap()
    //         .then(function(lakes){
    //             lakes.forEach(function(lake){
    //                 mapping[lake.name] = mongoose.Types.ObjectId();

    //             });               
    //             done();
    //         })
    //         .catch(done);
    //     });
    //     it('should scrape lakes',function(done){
    //         this.timeout(500000);

    //         hlugscraper.scrapeHLUGBadeseenQ(mapping)
    //         .then(function(){
    //             done();
    //         })
    //         .catch(done);
    //     });
    // });
});
