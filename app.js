const { mkLogger } = require('./logger');
const DnsZone = require('./models/dns.zone');
const DnsRecordset = require('./models/dns.recordset');
const _ = require('lodash');
const logger = mkLogger('app');
function parseName(domain) {
    const nameParts = domain.split('.');
    const tld = nameParts.pop();
    const host = nameParts.pop();
    const stub = nameParts.join('.');
    const zone = `${host}.${tld}`;
    return { stub, zone };
}
async function main() {
    const named = require('named-server');
    const server = named.createServer();
    const port = process.env.PORT || 53;
    server.listen(port, '0.0.0.0', function () {
        logger.info('😎 DNS server started on port', port);
    });

    server.on('query', async function (query) {
        try {


            const domain = query.name()
            const type = query.type();
            // const DEFAULT_TTL = 300;
            logger.info('DNS Query: (%s) %s', type, domain);

            const { zone, stub } = parseName(domain);
            const dnsZone = await DnsZone.findOne({
                dnsName: zone,
            });
            if (!dnsZone) {
                logger.error("No DNS Zone found:", { zone, stub });
                return server.send(query);
            }
            const dnsRecordset = await DnsRecordset.findOne({
                zone: dnsZone.id,
                stub,
                resourceType: type,
            });
            if (!dnsRecordset) {
                logger.error("No DNS Recordset found:", { zone, stub });
                logger.debug("DNS Zone record:", dnsZone);
                return server.send(query);
            }
            const result = type !== 'MX' && _.sample(dnsRecordset.records.map(r => r.value));
            const ttl = dnsRecordset.ttl;
            switch (dnsRecordset.resourceType) {
                case 'A': {

                    const record = new named.ARecord(result);
                    query.addAnswer(domain, record, ttl);
                    break;
                }
                case 'AAAA': {

                    const record = new named.AAAARecord(result);
                    query.addAnswer(domain, record, ttl);
                    break;
                }
                case 'CNAME': {

                    const record = new named.CNAMERecord(result);
                    query.addAnswer(domain, record, ttl);
                    break;
                }
                case 'MX': {

                    dnsRecordset.records.forEach((result, index) => {
                        const record = new named.MXRecord(result, {
                            priority: index
                        });
                        query.addAnswer(domain, record, ttl);
                    });
                    break;
                }
                case 'SOA': {

                    const record = new named.SOARecord(result);
                    query.addAnswer(domain, record, ttl);
                    break;
                }
                case 'SRV': {
                    const record = new named.SRVRecord(result);
                    query.addAnswer(domain, record, ttl);
                    break;
                }
                case 'TXT': {

                    const record = new named.TXTRecord(result);
                    query.addAnswer(domain, record, ttl);
                    break;
                }
            }
            server.send(query);
        }
        catch (e) {
            logger.fatal("DNS Query failed:", e);
            server.send(query);
        }
    });

    server.on('clientError', function (error) {
        logger.info("there was a clientError: %s", error);
    });

    server.on('uncaughtException', function (error) {
        logger.info("there was an excepton: %s", error);
    });

}

module.exports = main;