import {
    getSetting,
    registerSetting,
    createMutator,
    updateMutator,
    runGraphQL,
    webAppConnectHandlersUse,
    registerCallback,
    runCallbacks,
    runCallbacksAsync,
    Connectors,
    Collections
} from 'meteor/vulcan:core';
import Charges from '../../modules/charges/collection.js';
import Users from 'meteor/vulcan:users';
import { getCollection } from 'meteor/vulcan:lib'
import { vulcanInsertNewSubscription, vulcanCancelSubscription } from '../vulcanSubscriptionHelpers/vulcanSubscriptionHelpers.js'
//Strip stuff
//Vulcan Stripe Settings (copied from vulcan:payments)
registerSetting('stripe', null, 'Stripe settings');
registerSetting('stripe.publishableKey', null, 'Publishable key', true);
registerSetting('stripe.publishableKeyTest', null, 'Publishable key (test)', true);
registerSetting('stripe.secretKey', null, 'Secret key');
registerSetting('stripe.secretKeyTest', null, 'Secret key (test)');
registerSetting('stripe.endpointSecret', null, 'Endpoint secret for webhook');
registerSetting('stripe.alwaysUseTest', false, 'Always use test keys in all environments', true);

const stripeSettings = getSetting('stripe');
// use Vulcan settings stripe key to initialize stripe
const keySecret =
    Meteor.isDevelopment || stripeSettings && stripeSettings.alwaysUseTest
        ? stripeSettings && stripeSettings.secretKeyTest
        : stripeSettings && stripeSettings.secretKey;
const stripe = require('stripe')(keySecret);


/*********************************
 * *********************************
 * *********************************
 * createStripeSubscription
 * 
 * create a new subscription for user
 * returns: stripe subscription
 * 
 * After subscription create in stripe, stripe will call our webhook.js
 * when complete - and that's when subscription is recorded in vulcan
 * *********************************
 * *********************************
 **********************************/
export const createStripeSubscription = async (args, context) => {

    let customerId = args.customerId;
    // Attach the payment method to the customer
    // https://stripe.com/docs/billing/subscriptions/fixed-price#create-subscription
    // https://github.com/stripe-samples/subscription-use-cases/blob/master/fixed-price-subscriptions/server/node/server.js
    try {
        await stripe.paymentMethods.attach(args.paymentMethodId, {
            customer: customerId,
        });


    } catch (error) {
        throw error;
    }

    // Change the default invoice settings on the customer to the new payment method
    let updateCustomerDefaultPaymentMethod = await stripe.customers.update(
        customerId,
        {
            invoice_settings: {
                default_payment_method: args.paymentMethodId,
            },
        }
    );
    // create metadata object 
    const user = Users.findOne(args.userId)
    // verifies payment by vulcanPaymentId in invoice.paid webhook
    let metadata = {
        userId: args.userId,
        userName: Users.getDisplayName(user),
        userProfile: Users.getProfileUrl(user, true),
        vulcanProductKey: args.product.vulcanProductKey
    };
    const { associatedCollection, associatedDocument } = args;
    if (associatedCollection && associatedDocument) {
        metadata.associatedCollection = associatedCollection;
        metadata.associatedDocument = associatedDocument;
    }
    // Create the subscription
    const subscription = await stripe.subscriptions.create({
        customer: customerId,
        items: [{ price: args.product.apiId }],
        expand: ['latest_invoice.payment_intent'],
        metadata,
        //https://stripe.com/docs/api/subscriptions/create#create_subscription-trial_from_plan
        //apply the trial period days attached to the plan
        trial_from_plan: true
    });
    subscription.objectType = 'subscription';
    // console.log(subscription)

    //(if payment is incomplete, the status will say incomplete)
    //Save the stripe object to the Vulcan db
    await vulcanInsertNewSubscription(
        {
            stripeObject: subscription,
            userId: args.userId,
            args,
            context
        })
    //right after this, vulcanUpdateSubscription will run from webhook.js callback
    //so the subscription will always be updated with the most recent payment status


    return subscription;
}

/********************************
 * *********************************
 * *********************************
 * retryStripeSubscription
 * 
 * when subscription has failed, retry it
 * https://github.com/stripe-samples/subscription-use-cases/blob/master/fixed-price-subscriptions/server/node/server.js#L112
 * @param {*} args 
 * @param {*} context 
 * *********************************
 * *********************************
 *********************************/
export const retryStripeSubscription = async (args, context) => {

    //@TODO check if user current user has payment id 
    try {
        await stripe.paymentMethods.attach(args.paymentMethodId, {
            customer: args.customerId,
        });
        await stripe.customers.update(args.customerId, {
            invoice_settings: {
                default_payment_method: args.paymentMethodId,
            },
        });
    } catch (error) {
        // in case card_decline error
        return res
            .status('402')
            .send({ result: { error: { message: error.message } } });
    }

    //the status of retried payments is usually 'open' - 
    //the webhook will listen for completed payment, and update then update vulcan db
    const invoice = await stripe.invoices.retrieve(args.invoiceId, {
        expand: ['payment_intent'],
    });


    //don't need to update vulcan database for retries -
    //when retry is successful, invoice.paid callback will run from webhook.js

    return invoice
}

/********************************
 * *********************************
 * *********************************
 * cancelStripeSubscription
 * 
 * cancel subscriptions
 * @param {*} args 
 * @param {*} context 
 * *********************************
 * *********************************
 *********************************/
export const cancelStripeSubscription = async (args, context) => {
    //get current user
    const user = Users.findOne(context.currentUser._id)
    //get the stripe customer id
    const stripeCustomerId = user.stripeCustomerId
    // console.log(stripeCustomerId)
    //if there is one, get the user's subscription
    if (stripeCustomerId) {

        //find most recent active subscription charge
        let existingChargeDoc = await Connectors.find(Charges, {
            'userId': user._id,
            'data.status': 'active',
            'data.object': 'subscription'
        });
        //if it hasn't found active status, find trial status (i don't know how to combine the find operation)
        if (!existingChargeDoc.length) {
            existingChargeDoc = await Connectors.find(Charges, {
                'userId': user._id,
                'data.status': 'trialing',//updated to trialing
                'data.object': 'subscription'
            });
        }

        //if the charges is an array
        var stripeItemId = null

        if (existingChargeDoc && Array.isArray(existingChargeDoc)) {
            stripeItemId = existingChargeDoc[existingChargeDoc.length - 1]['data'].id
        }
        try {
            // try and delete the subscription
            // https://stripe.com/docs/api/subscription_items/delete
            const deletedSubscription = await stripe.subscriptions.del(
                stripeItemId
            );

            //if the canceled_at response has a value, it's done
            if (deletedSubscription.canceled_at) {
                //cancel subscription in vulcan
                await vulcanCancelSubscription(deletedSubscription, existingChargeDoc)

                //   //delete from database
                //   const stripeObject = deletedSubscription
                //   //create the new charge by updating the old one where necessary
                //   let newChargeDoc = existingChargeDoc[existingChargeDoc.length-1]
                //   newChargeDoc.status = 'canceled';//status has changed
                //   newChargeDoc.data = stripeObject;//update all the stripe data
                //   //new invoice url
                //   newChargeDoc.stripeChargeUrl = `https://dashboard.stripe.com/${!stripeObject.livemode && 'test/'}subscriptions/${stripeObject.id}`
                //   newChargeDoc.current_period_end = stripeObject.current_period_end;
                //   newChargeDoc.current_period_start = stripeObject.current_period_start;
                //   await updateMutator({
                //       collection: Charges,
                //       documentId: existingChargeDoc[existingChargeDoc.length-1]._id,
                //       data: newChargeDoc,
                //       validate: false
                //   });

            } else {
                //otherwise send back the error
                throw 'Subscription canceled, but database not updated.'
            }
            //finally return the deleted sub
            return (deletedSubscription);

        } catch (error) {
            //error cancelling subscription
            if (error.raw) {
                //if it's a stripe error, get the message
                throw (error.raw.message)
            } {
                //or it's probably a vulcan error
                throw error
            }

        }

    }

}