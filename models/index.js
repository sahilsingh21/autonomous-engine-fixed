/**
 * ALL MONGODB MODELS — TOOLIFY AI ENGINE
 * Single file, all schemas, all exports
 */
const mongoose = require('mongoose')
const { Schema } = mongoose

// ── Decision
const DecisionSchema = new Schema({
  action:    String,
  reasoning: String,
  context:   Schema.Types.Mixed,
  outcome:   { type: String, default: 'pending' },
  createdAt: { type: Date, default: Date.now }
})

// ── Task
const TaskSchema = new Schema({
  agent:     String,
  method:    String,
  params:    Schema.Types.Mixed,
  status:    { type: String, default: 'queued' },
  result:    Schema.Types.Mixed,
  createdAt: { type: Date, default: Date.now }
})

// ── Revenue — Razorpay payments
const RevenueSchema = new Schema({
  amount:      Number,
  currency:    { type: String, default: 'INR' },
  product:     String,
  razorpayId:  { type: String, unique: true, sparse: true }, // was stripeId
  stripeId:    { type: String, sparse: true },               // kept for migration
  orderId:     String,
  date:        { type: Date, default: Date.now },
  createdAt:   { type: Date, default: Date.now }
})

// ── Content
const ContentSchema = new Schema({
  type:           String,
  product:        String,
  platform:       String,
  content:        Schema.Types.Mixed,
  status:         { type: String, default: 'ready' },
  publishResults: Schema.Types.Mixed,
  engagement:     { likes: Number, comments: Number, shares: Number, clicks: Number },
  createdAt:      { type: Date, default: Date.now }
})

// ── AgentLog
const AgentLogSchema = new Schema({
  agent:     String,
  task:      String,
  level:     { type: String, enum: ['info', 'success', 'warning', 'error'], default: 'info' },
  message:   String,
  result:    String,
  createdAt: { type: Date, default: Date.now }
})

// ── PublishLog
const PublishLogSchema = new Schema({
  platform:  String,
  content:   String,
  url:       String,
  status:    String,
  error:     String,
  engagement: Schema.Types.Mixed,
  createdAt: { type: Date, default: Date.now }
})

// ── ResearchResult
const ResearchResultSchema = new Schema({
  type:      String,
  data:      Schema.Types.Mixed,
  synthesis: Schema.Types.Mixed,
  date:      { type: Date, default: Date.now }
})

// ── AdCampaign
const AdCampaignSchema = new Schema({
  name:        String,
  platform:    String,
  product:     String,
  budget:      Number,
  adCopy:      Schema.Types.Mixed,
  status:      { type: String, default: 'planned' },
  externalId:  String,
  metrics:     Schema.Types.Mixed,
  ctr:         Number,
  roas:        Number,
  refreshedAt: Date,
  createdAt:   { type: Date, default: Date.now }
})

// ── User (for product access tracking)
const UserSchema = new Schema({
  email:      { type: String, unique: true },
  name:       String,
  plan:       { type: String, default: 'free' },
  razorpayId: String,
  products:   [String],
  createdAt:  { type: Date, default: Date.now }
})

// Register models (guard against re-registration in dev)
const m = (name, schema) => mongoose.models[name] || mongoose.model(name, schema)

module.exports = {
  Decision:       m('Decision',       DecisionSchema),
  Task:           m('Task',           TaskSchema),
  Revenue:        m('Revenue',        RevenueSchema),
  Content:        m('Content',        ContentSchema),
  AgentLog:       m('AgentLog',       AgentLogSchema),
  PublishLog:     m('PublishLog',     PublishLogSchema),
  ResearchResult: m('ResearchResult', ResearchResultSchema),
  AdCampaign:     m('AdCampaign',     AdCampaignSchema),
  User:           m('User',           UserSchema),
}
