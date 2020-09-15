import express from 'express';
import { getSetting, registerSetting, createMutator, runGraphQL, Connectors, webAppConnectHandlersUse, Collections } from 'meteor/vulcan:core';
const bodyParser = require('body-parser');
import Users from 'meteor/vulcan:users';
import Charges from '../modules/charges/collection.js';

import { vulcanUpdateSubscription, vulcanCancelSubscription } from './vulcanSubscriptionHelpers/vulcanSubscriptionHelpers.js'
import { getCollection } from 'meteor/vulcan:lib'

//Strip stuff
//Vulcan Stripe Settings
registerSetting('stripe', null, 'Stripe settings');
registerSetting('stripe.publishableKey', null, 'Publishable key', true);
registerSetting('stripe.publishableKeyTest', null, 'Publishable key (test)', true);
registerSetting('stripe.secretKey', null, 'Secret key');
registerSetting('stripe.secretKeyTest', null, 'Secret key (test)');
registerSetting('stripe.endpointSecret', null, 'Endpoint secret for webhook');
registerSetting('stripe.endpointSecretTest', null, 'Endpoint secret for webhook');
registerSetting('stripe.alwaysUseTest', false, 'Always use test keys in all environments', true);
const stripeSettings = getSetting('stripe');

// use Vulcan settings stripe key to initialize stripe
const keySecret =
  Meteor.isDevelopment || stripeSettings && stripeSettings.alwaysUseTest
    ? stripeSettings && stripeSettings.secretKeyTest
    : stripeSettings && stripeSettings.secretKey;
const stripe = require('stripe')(keySecret);


// endpoint secret for checking stripe sig
const endpointSecret =
  Meteor.isDevelopment || stripeSettings && stripeSettings.alwaysUseTest
    ? stripeSettings && stripeSettings.endpointSecretTest
    : stripeSettings && stripeSettings.endpointSecret;


// import Inquiries from '../../modules/inquiries/collection.js';
const app = express();

// Use JSON parser for all non-webhook routes
app.use((req, res, next) => {
  if (req.originalUrl === '/webhook') {
    next();
  } else {
    bodyParser.json()(req, res, next);
  }
});

// app.set('json spaces', 2); // number of spaces for indentation
/*
Webhook for creating a new inquiry when receiving ping from Zapier
Note: use GraphQL to enable computed fields like pageUrl
*/
app.post('/webhook', bodyParser.raw({ type: 'application/json' }), async function (req, res) {
  // const { apikey, guestname, guestphone, guestinquiry, guestemail, listingid, listingurl, emailbody } = req.query;
  // testing URL: http://localhost:3000/create-inquiry?apikey=blItVRXnxDs49yE1d343dV6G0iqr6UKA3&guestname=John%20Wayne&listingid=123foo&listingurl=foourl&guestemail=fooemail&emailbody=foobody&guestphone=1234&guestinquiry=fooinquiry
  const sig = req.headers['stripe-signature'];

  let event;
  // https://stripe.com/docs/webhooks/signatures check stripe signature
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  }
  catch (err) {
    console.log(err.message)
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  //some other try catch
  try {
    event = JSON.parse(req.body);
  } catch (err) {
    res.status(400).send(`Webhook Error: ${err.message}`);
  }
  console.log(event.type)

  // Handle the event
  switch (event.type) {
    case 'invoice.paid':
      const invoicePaid = event.data.object;
      // Then define and call a method to handle the successful payment intent.
      await handleInvoicePaid(invoicePaid);
      return res.status(200).end();
      break;
    case 'invoice.payment_succeeded':
      const invoicePaymentSucceeded = event.data.object;
      // Then define and call a method to handle the successful payment intent.
      await handleInvoicePaid(invoicePaymentSucceeded);
      return res.status(200).end();
      break;
    case 'invoice.payment_failed':
      const invoiceFailed = event.data.object;
      await handleInvoiceFailed(invoiceFailed);
      return res.status(200).end();
      break;
    case 'customer.subscription.deleted':
      const subscriptionCancelled = event.data.object;
      //can use same as invoicefailed for cancelled sub
      await handleInvoiceCancelled(subscriptionCancelled);
      return res.status(200).end();
      break;
    default:
      // Unexpected event type
      return res.status(400).end();
  }

});

/**
 * WEBHOOK
 * handlePaymentIntentSucceeded
 * @param {*} paymentIntent 
 * 
 * Update Vulcan database record with payment result
 */
export const handleInvoicePaid = async (invoicePaid) => {

  const subscription = await stripe.subscriptions.retrieve(invoicePaid.subscription);
  const { userId, vulcanProductKey, associatedCollection, associatedDocument } = subscription.metadata;

  try {
    //the subscription id is attached to the associated document when createcustomer is called
    if (associatedCollection && associatedDocument) {
      const collection = getCollection(associatedCollection)
      //I'm just using the User and userID as the associated collection and document
      const document = await Connectors.get(collection, associatedDocument);

      // make sure the associated document (e.g. product or user) actually exists
      if (!document) {
        throw new Error(
          `Could not find ${associatedCollection} document with id ${associatedDocument} associated with subscription id ${
          subscription.id
          }; Not updating charge.`
        );
      }

      const args = {
        userId,
        vulcanProductKey,
        associatedCollection,
        associatedDocument,
        livemode: subscription.livemode,
      };

      await vulcanUpdateSubscription({ stripeObject: subscription, userId, args, collection, document })
      return invoicePaid;
      // processAction({ collection, document, stripeObject: invoicePaid, args });
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.log('// Stripe webhook error');
    // eslint-disable-next-line no-console
    console.log(error);
  }

}

/**
 * WEBHOOK
 * handlePaymentIntentFailed
 * @param {*} paymentIntent 
 * 
 * Update Vulcan database record with payment result
 */
export const handleInvoiceFailed = async (invoiceFailed) => {

  const subscription = await stripe.subscriptions.retrieve(invoiceFailed.subscription);
  const { userId, vulcanProductKey, associatedCollection, associatedDocument } = subscription.metadata;

  try {
    if (associatedCollection && associatedDocument) {
      const collection = getCollection(associatedCollection)
      const document = await Connectors.get(collection, associatedDocument);

      // make sure document actually exists
      if (!document) {
        throw new Error(
          `Could not find ${associatedCollection} document with id ${associatedDocument} associated with subscription id ${
          subscription.id
          }; Not updating charge.`
        );
      }

      const args = {
        userId,
        vulcanProductKey,
        associatedCollection,
        associatedDocument,
        livemode: subscription.livemode,
      };

      await vulcanUpdateSubscription({ stripeObject: subscription, userId, args, collection, document })
      return invoiceFailed;
      // processAction({ collection, document, stripeObject: invoicePaid, args });
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.log('// Stripe webhook error');
    // eslint-disable-next-line no-console
    console.log(error);
  }

}
/**
 * WEBHOOK
 * handlePaymentIntentFailed
 * @param {*} paymentIntent 
 * 
 * Update Vulcan database record with payment result
 */
export const handleInvoiceCancelled = async (subscriptionCancelled) => {

  const subscription = await stripe.subscriptions.retrieve(subscriptionCancelled.id);
  const { userId, vulcanProductKey, associatedCollection, associatedDocument } = subscription.metadata;

  try {
    if (associatedCollection && associatedDocument) {
      const collection = getCollection(associatedCollection)
      const user = await Connectors.get(collection, associatedDocument);
      // make sure document actually exists
      if (!user) {
        throw new Error(
          `Could not find ${associatedCollection} document with id ${associatedDocument} associated with subscription id ${
          subscription.id
          }; Not updating charge.`
        );
      }

      let existingChargeDoc = await Connectors.find(Charges, {
        'userId': user._id,
        'data.status': 'active',
        'data.object': 'subscription'
      });
      //if it hasn't found active status, find trial status (i don't know how to combine the find operation)
      if (!existingChargeDoc.length) {
        console.log('no active subscription')
        return subscriptionCancelled
      }

      await vulcanCancelSubscription(subscriptionCancelled, existingChargeDoc)
      return subscriptionCancelled;
      // processAction({ collection, document, stripeObject: invoicePaid, args });
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.log('// Stripe webhook error');
    // eslint-disable-next-line no-console
    console.log(error);
  }

}

webAppConnectHandlersUse(Meteor.bindEnvironment(app), { name: 'stripe_endpoint', order: 102 });