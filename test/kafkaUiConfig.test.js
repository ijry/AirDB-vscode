const assert = require("assert");
const fs = require("fs");
const path = require("path");

const connect = fs.readFileSync(path.resolve(__dirname, "../src/vue/connect/index.vue"), "utf8");
const kafkaPath = path.resolve(__dirname, "../src/vue/connect/component/Kafka.vue");

assert.ok(fs.existsSync(kafkaPath), "Kafka.vue exists");
const kafka = fs.readFileSync(kafkaPath, "utf8");

assert.match(connect, /import Kafka from "\.\/component\/Kafka\.vue"/);
assert.match(connect, /components: \{[\s\S]*Kafka/);
assert.match(connect, /Kafka:\s*\{\s*text:\s*"KA"/);
assert.match(connect, /supportDatabases:\s*\[[\s\S]*"Kafka"/);
assert.match(connect, /<Kafka\s+v-else-if="connectionOption\.dbType == 'Kafka'"/);
assert.match(connect, /\['MySQL', 'PostgreSQL', 'KingbaseES', 'MongoDB', 'Redis', 'ElasticSearch', 'Kafka'\]/);
assert.match(connect, /case "Kafka":[\s\S]*this\.connectionOption\.host = "127\.0\.0\.1:9092";[\s\S]*this\.connectionOption\.brokers = "127\.0\.0\.1:9092";[\s\S]*this\.connectionOption\.clientId = "airdb";[\s\S]*this\.connectionOption\.kafkaAuth = "none";[\s\S]*this\.connectionOption\.port = null;/);

assert.match(kafka, /Brokers/);
assert.match(kafka, /Client ID/);
assert.match(kafka, /kafkaAuth/);
assert.match(kafka, /scram-sha-256/);
assert.match(kafka, /scram-sha-512/);
assert.match(kafka, /connectionOption\.host = value/);
assert.match(kafka, /connectionOption\.brokers = value/);

console.log("kafkaUiConfig tests passed");
