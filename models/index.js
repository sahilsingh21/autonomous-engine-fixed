/**
 * ALL MONGODB MODELS — TOOLIFY AI ENGINE
 * Added: Approval model for human review system
 */
const mongoose = require('mongoose')
const { Schema } = mongoose

const DecisionSchema = new Schema({
  action:    String,
  reasoning: String,
  context:   Schema.Types.Mixed,
  outcome:   { type: String, default: 'pending' },
  createdAt: { type: Date, default: Date.now }
})

const TaskSchema = new Schema({
  agent:     String,
  method:    String,
  params:    Schema.Types.Mixed,
  status:    { type: String, default: 'queued' },
  result:    Schema.Types.Mixed,
  createdAt: { type: Date, default: Date.now }
})

const RevenueSchema = new Schema({
  amount:     Number,
  currency:   { type: String, default: 'INR' },
  product:    String,
  razorpayId: { type: String, unique: true, sparse: true },
  stripeId:   { type: String, sparse: true },
  orderId:    String,
  date:       { type: Date, default: Date.now },
  createdAt:  { type: Date, default: Date.now }
})

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

const AgentLogSchema = new Schema({
  agent:     String,
  task:      String,
  level:     { type: String, enum: ['info','success','warning','error'], default: 'info' },
  message:   String,
  result:    String,
  createdAt: { type: Date, default: Date.now }
})

const PublishLogSchema = new Schema({
  platform:   String,
  content:    String,
  url:        String,
  status:     String,
  error:      String,
  engagement: Schema.Types.Mixed,
  createdAt:  { type: Date, default: Date.now }
})

const ResearchResultSchema = new Schema({
  type:      String,
  data:      Schema.Types.Mixed,
  synthesis: Schema.Types.Mixed,
  date:      { type: Date, default: Date.now }
})

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

const UserSchema = new Schema({
  email:      { type: String, unique: true },
  name:       String,
  plan:       { type: String, default: 'free' },
  razorpayId: String,
  products:   [String],
  createdAt:  { type: Date, default: Date.now }
})

// ── NEW: Approval model for human review system
const ApprovalSchema = new Schema({
  platform:      { type: String, enum: ['linkedin', 'twitter', 'reddit'], required: true },
  product:       String,
  content:       Schema.Types.Mixed,   // full content object
  approveToken:  { type: String, unique: true },
  rejectToken:   { type: String, unique: true },
  status:        { type: String, enum: ['pending','approved','rejected','auto_approved','expired'], default: 'pending' },
  reviewedAt:    Date,
  expiresAt:     Date,  // null = never auto-approve
  emailSent:     { type: Boolean, default: false },
  createdAt:     { type: Date, default: Date.now }
})

// Index for fast token lookups
ApprovalSchema.index({ approveToken: 1 })
ApprovalSchema.index({ rejectToken:  1 })
ApprovalSchema.index({ status: 1, createdAt: -1 })

// Auto-expire old pending approvals after 7 days
ApprovalSchema.index({ createdAt: 1 }, { expireAfterSeconds: 604800 })

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
  Approval:       m('Approval',       ApprovalSchema),
}
