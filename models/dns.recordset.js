'use strict';
var mongoose = require('mongoose')
    , ObjectId = mongoose.Schema.Types.ObjectId;

var schema = new mongoose.Schema({
    stub: String,
    zone: { ref: "DnsZone", type: ObjectId },
    resourceType: {
        type: String,
        enum: ['A', 'AAAA', 'MX', 'CNAME', 'SOA', 'SRV', 'TXT']
    },
    ttl: { type: Number, default: 300 },
    records: [{ value: String, weight: Number }],
    routingPolicy: Number
});
module.exports.ROUTING_POLICY = schema.statics.ROUTING_POLICY = {
    ROUND_ROBIN: 0,
    WEIGHTED_ROUND_ROBIN: 1,
    GEO: 2
};
schema.pre('save', async function (next) {
    const { stub, zone, resourceType } = this;
    const existing = await this.$model("dns.Recordset").findOne({
        stub,
        zone,
        resourceType
    });
    if (existing) {
        return next(new Error("Duplicate record (stub, zone, resourceType)"));
    }
})
module.exports = mongoose.model('dns.Recordset', schema);

