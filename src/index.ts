// Import dependencies
import express from "express";
import cluster from "cluster";
import os from "os";
import * as expressWinston from "express-winston";
import { registerHandlebars } from "./handlebar";
import Protocols from "./protocols";
import GlobalController from "./routes/GlobalController";
import CamouflageController from "./routes/CamouflageController";
import BackupScheduler from "./BackupScheduler";
import logger from "./logger";
import { setLogLevel } from "./logger";
import * as protoLoader from "@grpc/proto-loader";
import apicache from "apicache";
import promBundle from "express-prom-bundle";
import redis from 'redis';
import swStats from "swagger-stats";
import cors from 'cors';
import compression from 'compression';
import ConfigLoader, { getLoaderInstance, setLoaderInstance } from "./ConfigLoader";
import { CamouflageConfig } from "./ConfigLoader/LoaderInterface";

const app = express();
app.use(promBundle({ includeMethod: true, includePath: true }));
// Configure logging for express requests
app.use(
  expressWinston.logger({
    level: () => "level",
    winstonInstance: logger,
    statusLevels: { error: "error", success: "debug", warn: "warn" },
    msg: "HTTP {{req.method}} {{req.path}} :: Query Parameters: {{JSON.stringify(req.query)}} | Request Headers {{JSON.stringify(req.headers)}} | Request Body {{JSON.stringify(req.body)}}",
  })
);
// Configure swagger-stats middleware for monitoring
app.use(
  swStats.getMiddleware({
    name: "Camouflage",
    uriPath: "/monitoring",
  })
);
// Configure express to understand json/url encoded request body
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// Configure express to compress responses - FUTURE IMPROVEMENT - Allow compression options
app.use(compression());
/**
 * Initializes required variables and starts a 1 master X workers configuration - FUTURE IMPROVEMENT - Pass a single config object
 * @param {string[]} protoIgnore array of files to be ignored during loading proto files
 * @param {string} plconfig configuration for protoloader
 * @param {string} configFilePath location of config file
 */
const start = (
  protoIgnore: string[],
  plconfig: protoLoader.Options,
  configFilePath: string,
) => {
  const configLoader: ConfigLoader = new ConfigLoader(configFilePath);
  configLoader.validateAndLoad()
  setLoaderInstance(configLoader)
  const config: CamouflageConfig = getLoaderInstance().getConfig()
  // Set log level to the configured level from config.yaml
  setLogLevel(config.loglevel);
  logger.debug(JSON.stringify(config, null, 2))
  // Configure cors
  if (config.origins.length !== 0) {
    logger.info(`CORS enabled for ${config.origins.join(", ")}`)
    app.use(cors({
      origin: config.origins
    }));
  }
  // Configure cache if enabled.
  if (config.cache.enable) {
    try {
      logger.debug(`Cache Options: ${JSON.stringify(config.cache, null, 2)}`);
      // If cacheOptions has a redis details, use redis as cache store, else by default in memory cache is used.
      if (config.cache.cache_options.redis_options) {
        const redisOptions: redis.ClientOpts = config.cache.cache_options.redis_options;
        delete config.cache.cache_options.redis_options;
        config.cache.cache_options.redisClient = redis.createClient(redisOptions)
      }
      const cache = apicache.options(config.cache.cache_options).middleware;
      app.use(cache(`${config.cache.ttl_seconds} seconds`));
      logger.info(`Cache enabled with TTL ${config.cache.ttl_seconds} seconds`)
    } catch (error) {
      logger.info(`Cache couldn't be configured. ${error.message}`)
    }
  }
  logger.info(`[${process.pid}] Worker started`);
  // Set custom labels for prometheus
  swStats.getPromClient().register.setDefaultLabels({ instance: os.hostname(), workerId: typeof cluster.worker !== "undefined" ? cluster.worker.id : 0 });
  // Register Handlebars
  registerHandlebars();
  // Register Controllers
  new CamouflageController(app);
  new GlobalController(app);
  const protocols = new Protocols(app);
  // Start the http server on the specified port
  if (config.protocols.http.enable) {
    protocols.initHttp();
  }
  // If https protocol is enabled, start https server with additional inputs
  if (config.protocols.https.enable) {
    protocols.initHttps();
  }
  // If https protocol is enabled, start https server with additional inputs
  if (config.protocols.http2.enable) {
    protocols.initHttp2();
  }
  // If grpc protocol is enabled, start grpc server with additional inputs
  if (config.protocols.grpc.enable) {
    protocols.initGrpc(protoIgnore, plconfig);
  }
  // If websocket protocol is enabled, start ws server with additional inputs
  if (config.protocols.ws.enable) {
    protocols.initws();
  }
  // If thrift protocol is enabled, start thrift server with additional inputs
  if (config.protocols.thrift.enable) {
    protocols.initThrift();
  }
  // If backup is enabled, schedule a cron job to copy file to backup directory
  if (config.backup.enable) {
    const backupScheduler: BackupScheduler = new BackupScheduler(configFilePath);
    backupScheduler.schedule();
  }
};
/**
 * Exports the start function which should be called from bin/camouflage.js with required parameters
 */
module.exports.start = start;
/**
 * Exports app for testing purpose
 */
module.exports.app = app;