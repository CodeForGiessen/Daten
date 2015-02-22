> Scraper to scrape le badeseen.hlug.de


## Install

```sh
$ npm install --production
```

##Mapping
You need a mapping to execute the scraper.
A new mapping.json can be created with the create_lake_mapping.js in the scripts folder.

For Help:
```sh
$ node scripts/create_lake_mapping.js -h
```

## Usage
### Script
Use the scrape_hlug.js script in the scripts folder.
For Help:
```sh
$ node scripts/scrape_hlug.js -h
```
### As module
#### Linking

```sh
$ npm link hlugscraper
```

Don't forget to link it with your global repository first.

#### Install it 
```sh
$ npm install <folderToModule>```

##Development
Run this command after you are finished with developing in the Badeseen folder of the repository. It takes approx 1 minute to run.

```sh
$ node hlugScraper/scripts/scrape_hlug.js -m ScrapedData/lakeMapping.json -f ScrapedData/badeseen.json
```

## License

MIT © [2014](Vincent Elliott Wagner)
