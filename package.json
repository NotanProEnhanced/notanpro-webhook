// server.js - NotanPro Stripe Webhook Handler
const express = require('express');
const cors = require('cors');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: process.env.FIREBASE_PROJECT_ID
});

const db = admin.firestore();
const app = express();

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'https://your-domain.com',
  credentials: true
}));

// Stripe webhook endpoint - MUST be before express.json()
app.post('/webhook', express.raw({type: 'application/json'}), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  
  let event;
  
  try {
    // Verify webhook signature
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    console.log('Webhook verified:', event.type);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    // Handle the event
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object);
        break;
        
      case 'customer.subscription.created':
        await handleSubscriptionCreated(event.data.object);
        break;
        
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object);
        break;
        
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object);
        break;
        
      case 'invoice.payment_succeeded':
        await handlePaymentSucceeded(event.data.object);
        break;
        
      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object);
        break;
        
      default:
        console.log(`Unhandled event type ${event.type}`);
    }
    
    res.json({received: true});
  } catch (error) {
    console.error('Error processing webhook:', error);
    res.status(500).json({error: 'Webhook processing failed'});
  }
});

// Other middleware after webhook
app.use(express.json());

// Handle successful checkout completion
async function handleCheckoutCompleted(session) {
  console.log('Processing checkout completion:', session.id);
  
  const userId = session.client_reference_id;
  if (!userId) {
    console.error('No user ID found in checkout session');
    return;
  }
  
  const subscriptionId = session.subscription;
  const customerId = session.customer;
  
  // Update user's subscription status
  await db.collection('users').doc(userId).update({
    subscriptionStatus: 'active',
    subscriptionId: subscriptionId,
    customerId: customerId,
    activatedDate: admin.firestore.FieldValue.serverTimestamp(),
    trialEndDate: null // Clear trial since they're now paying
  });
  
  console.log(`User ${userId} subscription activated`);
}

// Handle subscription creation
async function handleSubscriptionCreated(subscription) {
  console.log('Processing subscription creation:', subscription.id);
  
  const customerId = subscription.customer;
  
  // Find user by customer ID
  const userQuery = await db.collection('users')
    .where('customerId', '==', customerId)
    .limit(1)
    .get();
    
  if (userQuery.empty) {
    console.error('No user found for customer ID:', customerId);
    return;
  }
  
  const userDoc = userQuery.docs[0];
  await userDoc.ref.update({
    subscriptionStatus: 'active',
    subscriptionId: subscription.id,
    currentPeriodStart: new Date(subscription.current_period_start * 1000),
    currentPeriodEnd: new Date(subscription.current_period_end * 1000)
  });
  
  console.log(`Subscription ${subscription.id} created for user ${userDoc.id}`);
}

// Handle subscription updates (renewals, plan changes, etc.)
async function handleSubscriptionUpdated(subscription) {
  console.log('Processing subscription update:', subscription.id);
  
  // Find user by subscription ID
  const userQuery = await db.collection('users')
    .where('subscriptionId', '==', subscription.id)
    .limit(1)
    .get();
    
  if (userQuery.empty) {
    console.error('No user found for subscription ID:', subscription.id);
    return;
  }
  
  const userDoc = userQuery.docs[0];
  const status = subscription.status === 'active' ? 'active' : 'inactive';
  
  await userDoc.ref.update({
    subscriptionStatus: status,
    currentPeriodStart: new Date(subscription.current_period_start * 1000),
    currentPeriodEnd: new Date(subscription.current_period_end * 1000),
    updatedDate: admin.firestore.FieldValue.serverTimestamp()
  });
  
  console.log(`Subscription ${subscription.id} updated for user ${userDoc.id}`);
}

// Handle subscription cancellation/deletion
async function handleSubscriptionDeleted(subscription) {
  console.log('Processing subscription deletion:', subscription.id);
  
  // Find user by subscription ID
  const userQuery = await db.collection('users')
    .where('subscriptionId', '==', subscription.id)
    .limit(1)
    .get();
    
  if (userQuery.empty) {
    console.error('No user found for subscription ID:', subscription.id);
    return;
  }
  
  const userDoc = userQuery.docs[0];
  
  await userDoc.ref.update({
    subscriptionStatus: 'expired',
    cancelledDate: admin.firestore.FieldValue.serverTimestamp()
  });
  
  console.log(`Subscription ${subscription.id} cancelled for user ${userDoc.id}`);
}

// Handle successful payment
async function handlePaymentSucceeded(invoice) {
  console.log('Processing successful payment:', invoice.id);
  
  const subscriptionId = invoice.subscription;
  if (!subscriptionId) return;
  
  // Find user by subscription ID
  const userQuery = await db.collection('users')
    .where('subscriptionId', '==', subscriptionId)
    .limit(1)
    .get();
    
  if (userQuery.empty) {
    console.error('No user found for subscription ID:', subscriptionId);
    return;
  }
  
  const userDoc = userQuery.docs[0];
  
  // Record payment history
  await db.collection('payments').add({
    userId: userDoc.id,
    subscriptionId: subscriptionId,
    invoiceId: invoice.id,
    amount: invoice.amount_paid,
    currency: invoice.currency,
    status: 'succeeded',
    paidDate: admin.firestore.FieldValue.serverTimestamp()
  });
  
  // Ensure subscription is active
  await userDoc.ref.update({
    subscriptionStatus: 'active',
    lastPaymentDate: admin.firestore.FieldValue.serverTimestamp()
  });
  
  console.log(`Payment processed for user ${userDoc.id}`);
}

// Handle failed payment
async function handlePaymentFailed(invoice) {
  console.log('Processing failed payment:', invoice.id);
  
  const subscriptionId = invoice.subscription;
  if (!subscriptionId) return;
  
  // Find user by subscription ID
  const userQuery = await db.collection('users')
    .where('subscriptionId', '==', subscriptionId)
    .limit(1)
    .get();
    
  if (userQuery.empty) {
    console.error('No user found for subscription ID:', subscriptionId);
    return;
  }
  
  const userDoc = userQuery.docs[0];
  
  // Record failed payment
  await db.collection('payments').add({
    userId: userDoc.id,
    subscriptionId: subscriptionId,
    invoiceId: invoice.id,
    amount: invoice.amount_due,
    currency: invoice.currency,
    status: 'failed',
    failedDate: admin.firestore.FieldValue.serverTimestamp()
  });
  
  // Mark subscription as past due
  await userDoc.ref.update({
    subscriptionStatus: 'past_due',
    lastFailedPaymentDate: admin.firestore.FieldValue.serverTimestamp()
  });
  
  console.log(`Payment failed for user ${userDoc.id}`);
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    service: 'notanpro-webhook'
  });
});

// Get subscription status endpoint (for frontend verification)
app.get('/subscription-status/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;
    const userDoc = await db.collection('users').doc(userId).get();
    
    if (!userDoc.exists) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const userData = userDoc.data();
    res.json({
      subscriptionStatus: userData.subscriptionStatus || 'trial',
      subscriptionId: userData.subscriptionId,
      currentPeriodEnd: userData.currentPeriodEnd,
      trialEndDate: userData.trialEndDate
    });
  } catch (error) {
    console.error('Error fetching subscription status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Server error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`NotanPro webhook server running on port ${PORT}`);
});
