require('dotenv').config();
const mongoose = require('mongoose');
const logger = require('./logger').mkLogger('bizi-dns');
const util = require('util');
const dbhost = process.env.DB_ADDR || "127.0.0.1",
    dbport = process.env.DB_PORT || 27017,
    dbname = new String(process.env.DB_NAME || "/feta/db").replace(/\//g, ""),
    dbuser = encodeURIComponent(process.env.DB_USER),
    dbpass = encodeURIComponent(process.env.DB_PASS);
const dsn = util.format("mongodb://%s:%s@%s:%s/%s", dbuser, dbpass, dbhost, dbport, dbname);

mongoose.connect(dsn, { ssl: true, sslValidate: false })
    .then(async cnx => {
        logger.sub('mongoose')
            .debug("Mongoose connection:", cnx);
        logger.info("Connected to database");
        if (!process.env.NO_START) {

            const app = require('./app');
            await app(Promise.resolve(mongoose.connection.getClient()));
        }
        logger.info("App setup complete");
    })
    .catch(err => {
        logger.sub('mongoose')
            .fatal("Unable to connect to database:", err);
        process.exit(1);
    })