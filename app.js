const dns2 = require('dns2');

const { mkLogger } = require('./logger');
const DnsZone = require('./models/dns.zone');
const DnsRecordset = require('./models/dns.recordset');
const _ = require('lodash');
const logger = mkLogger('app');
const parseDomain = require('parse-domains');
const { Packet } = dns2;

const TYPE_NAMES = Object.fromEntries(Object.entries(Packet.TYPE).map(e => [e[1], e[0]]));
logger.debug({ TYPE_NAMES });
async function main() {


    const server = dns2.createServer({
        udp: true,
        tcp: true,
        handle: async (request, send, rinfo) => {
            logger.info("Got a request:", request);
            const response = Packet.createResponseFromRequest(request);
            const [question] = request.questions;
            logger.debug("Got question:", question);
            const { name } = question;
            const type = TYPE_NAMES[question.type];
            logger.debug("Resource type?", type);
            try {


                const domain = name
                // const DEFAULT_TTL = 300;
                logger.info('DNS Query: (%s) %s', type, domain);
                const parsed = await parseDomain(domain);
                const zone = parsed.domain;
                let stub = parsed.subdomain;
                logger.debug({ name, domain, parsed, zone, stub })
                const regexStrict = v => `^${v}$`;
                const dnsZones = await DnsZone.find({
                    dnsName: new RegExp(`((${stub}\.)|^)` + zone + '$', 'i')
                });
                if (!dnsZones, length) {
                    logger.error("No DNS Zone found:", { zone, stub });
                    return send(response)
                }
                logger.debug("dnsZone:", dnsZones.map(d => d.toJSON()));
                const dnsRecordsets = await DnsRecordset.find({
                    $or: dnsZones.map(z => {
                        const searchStub = z.dnsName.indexOf(stub) === 0 ? undefined : stub;
                        return {
                            stub: searchStub,
                            zone: z.id,
                            resourceType: type
                        }
                    })
                });
                const dnsRecordset = dnsRecordsets[0];
                if (!dnsRecordset) {
                    logger.error("No DNS Recordset found:", { zone, stub });
                    logger.debug("DNS Zone record:", dnsZone);
                    return send(response)
                }
                dnsRecordset.records = dnsRecordsets.flatMap(d => d.records);
                const result = ['TXT', 'MX', 'NS'].indexOf(dnsRecordset.resourceType) === -1 && _.sample(dnsRecordset.records.map(r => r.value));
                const ttl = dnsRecordset.ttl;
                logger.debug("Recordest:", dnsRecordset);
                switch (dnsRecordset.resourceType) {
                    case 'A': {

                        response.answers.push({
                            name,
                            type: question.type,
                            class: Packet.CLASS.IN,
                            ttl,
                            address: result
                        })
                        break;
                    }
                    case 'AAAA': {

                        response.answers.push({
                            name,
                            type: question.type,
                            class: Packet.CLASS.IN,
                            ttl,
                            address
                        })
                        break;
                    }
                    case 'CNAME': {

                        response.answers.push({
                            name,
                            type: question.type,
                            class: Packet.CLASS.IN,
                            ttl,
                            domain: result
                        })
                        break;
                    }
                    case 'NS': {
                        dnsRecordset.records.forEach((result) => {
                            response.answers.push({
                                name,
                                type: question.type,
                                class: Packet.CLASS.IN,
                                ttl,
                                ns: result.value
                            })
                        });
                        break;
                    }
                    case 'MX': {

                        dnsRecordset.records.forEach((result, index) => {
                            response.answers.push({
                                name,
                                type: question.type,
                                class: Packet.CLASS.IN,
                                ttl,
                                priority: index,
                                exchange: result.value

                            })
                        });
                        break;
                    }
                    case 'SOA': {
                        const soaParts = result.split(' ');
                        if (!soaParts.length === 7) {
                            logger.error("Invalid SOA Record:", { result, soaParts, dnsRecordset, dnsZone });
                            break;
                        }
                        let [primary, admin, serial, refresh, retry, expiration, min] = soaParts;
                        // const record = new named.SOARecord(host, {

                        // });
                        response.answers.push({
                            name,
                            type: question.type,
                            class: Packet.CLASS.IN,
                            primary,
                            ttl,
                            admin,
                            serial,
                            refresh,
                            retry,
                            expiration,
                            minimum: Number(min)
                        })
                        break;
                    }
                    case 'SRV': {
                        // response.answers.push({
                        //     name,
                        //     type: question.type,
                        //     class: Packet.CLASS.IN,
                        //     ttl,
                        //     target: result
                        // })
                        throw "not implemented";
                        break;
                    }
                    case 'TXT': {

                        dnsRecordset.records.forEach((result) => {
                            response.answers.push({
                                name,
                                type: question.type,
                                class: Packet.CLASS.IN,
                                ttl,
                                data: result.value
                            })
                        });
                        break;
                    }
                }
                // send(response)
                // response.answers.push({
                //     name,
                //     type: Packet.TYPE.SOA,
                //     class: Packet.CLASS.IN,
                //     ttl: 300,
                //     primary: 
                //     serial: 2,
                //     refresh: 28000,
                //     retry: 3600,
                //     expiration: 259200,
                //     minimum: 300
                // });
            }
            catch (e) {
                logger.fatal("DNS Query failed:", e);
                send(response)
            }
            response.header.aa = 1;

            send(response);
        }
    });

    server.on('request', (request, response, rinfo) => {
        logger.debug(request.header.id, request.questions[0]);
        logger.debug(rinfo);
    });

    server.on('requestError', (error) => {
        logger.debug('Client sent an invalid request', error);
    });

    server.on('listening', () => {
        logger.debug(server.addresses());
    });

    server.on('close', () => {
        logger.debug('server closed');
    });
    const port = process.env.PORT || 53;

    server.listen({
        // Optionally specify port, address and/or the family of socket() for udp server:
        udp: {
            port,
            address: "0.0.0.0",
            // address: "127.0.0.1",
            type: "udp4",  // IPv4 or IPv6 (Must be either "udp4" or "udp6")
        },

        // Optionally specify port and/or address for tcp server:
        tcp: {
            port,
            // address: "127.0.0.1",
        },
    });

    // eventually
    // server.close();
}

module.exports = main;