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


//Strip stuff
//Vulcan Stripe Settings
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

/***********************************
 * vulcanUpdateSubscription
 *  
 * Update an EXISTING subscription, etc. on Vulcan's side
 * If subscription doesn't exist, call vulcanInsertNewSubscription to make a new one
 * Adapted from vulcan:payments (integrations/stripe.js)
 * 
 * Called from webhook with Stripe event type: 'invoice.paid' and 'invoice.payment_failed'
 * 
 * Also used to update the subscription date! 
 **********************************/
export const vulcanUpdateSubscription = async ({
    stripeObject,
    userId,
    args,
    collection,
    document
}) => {
    let returnDocument = {};
    // find the existing document
    const existingChargeDoc = await Connectors.get(Charges, {
        'data.id': stripeObject.id,
    });

    if (existingChargeDoc && existingChargeDoc.type == 'subscription') {
        console.log(
            `// Active charge with Stripe id ${stripeObject.id} exists in db; updating record.`
        );

        //update subscription
        //create the new charge by updating the old one where necessary
        let newChargeDoc = existingChargeDoc
        
        newChargeDoc.status = stripeObject.status;//status has changed
        newChargeDoc.data = stripeObject;//update all the stripe data
        //new invoice url
        newChargeDoc.stripeChargeUrl = `https://dashboard.stripe.com/${!stripeObject.livemode && 'test/'}subscriptions/${stripeObject.id}`
        newChargeDoc.current_period_end = stripeObject.current_period_end;
        newChargeDoc.current_period_start = stripeObject.current_period_start;
        await updateMutator({
            collection: Charges,
            documentId: existingChargeDoc._id,
            data: newChargeDoc,
            validate: false
        });
        return stripeObject;
    } else {
        //we're not updating a payment,so store as a new payment
        await vulcanInsertNewSubscription({
            stripeObject,
            userId,
            args
        })
        //just return the stripe object
        return stripeObject
    }

}

/***********************************
 * vulcanInsertNewSubscription
 * 
 * Process subscriptions, etc. on Vulcan's side
 * Adapted from vulcan:payments (integrations/stripe.js)
 * 
 * Called from vulcanUpdateSubscription
 **********************************/

export const vulcanInsertNewSubscription = async ({
    stripeObject,
    userId,
    args,
    context,
}) => {

    const {
        associatedCollection,
        associatedDocument,
        product } = args;


    let collection, document = {};
    // if an associated collection name and document id have been provided,
    // get the associated collection and document

    // ** for subscriptions, associatedDocument isn't really necessary 
    //- just check if the user's subscription is active 

    if (associatedCollection && associatedDocument) {
        // collection = _.findWhere(Collections, { _name: associatedCollection });
        collection = getCollection(associatedCollection)
        document = await Connectors.get(collection, associatedDocument);
    } else {
        throw 'assocatedCollection and associatedDocument are missing.'
    }

    let returnDocument = {};

    // make sure charge hasn't already been processed
    // (could happen with multiple endpoints listening)
    const existingCharge = await Connectors.get(Charges, {
        'data.id': stripeObject.id,
    });

    if (existingCharge) {
        // eslint-disable-next-line no-console
        console.log(
            `// Charge with Stripe id ${stripeObject.id} already exists in db; aborting processAction`
        );
        throw 'Charge with Stripe id' + stripeObject.id + 'already exists.'
        return collection && document ? document : {};
    }

    const productKey = (product && product.apiId) ? product.apiId : (stripeObject.plan && stripeObject.plan.id) ? stripeObject.plan.id : null
    //get the invoice pdf
    // console.log(stripeObject.latest_invoice)
    let invoice = null
    if (stripeObject.latest_invoice && stripeObject.latest_invoice.id) {
        //if the stripeObject has the full invoice object, use it
        //(if there's an invoice.id, it does)
        invoice = stripeObject.latest_invoice


    } else {
        //otherwise grab the invoice with the stripe api
        invoice = await stripe.invoices.retrieve(stripeObject.latest_invoice)
    }

     // create charge document for storing in our own Charges collection
    const chargeDoc = {
        //Vulcan properties
        createdAt: new Date(),
        productKey,
        userId,
        associatedCollection,
        associatedDocument,

        //Stripe properties
        // Stripe object for reference: https://stripe.com/docs/api/subscriptions/object
        data: stripeObject,

        //start and end date - important for subscription expiration
        current_period_end: stripeObject.current_period_end,
        current_period_start: stripeObject.current_period_start,
        type: stripeObject.object,
        source: 'stripe',
        test: !stripeObject.livemode,
        amount: stripeObject.plan.amount,
        latest_invoice: invoice ? invoice.invoice_pdf : stripeObject.latest_invoice,
        stripeId: stripeObject.id,
        status: stripeObject.status,
        //if not in livemode, store the test url
        stripeChargeUrl: `https://dashboard.stripe.com/${!stripeObject.livemode && 'test/'}subscriptions/${stripeObject.id}`
    };

    // console.log(stripeObject)

    // insert
    const chargeSavedData = await createMutator({
        collection: Charges,
        data: chargeDoc,
        validate: false,
    });

    const chargeSaved = chargeSavedData.data;

    // return chargeSaved;
    const user = Users.findOne(userId)

    // if an associated collection and id have been provided,
    // update the associated document
    if (collection && document) {
        // note: assume a single document can have multiple successive charges associated to it
        const chargeIds = document.chargeIds
            ? [...document.chargeIds, chargeSaved._id]
            : [chargeSaved._id];

        let data = { chargeIds };

        // run collection.charge.sync callbacks
        data = await runCallbacks({
            name: 'stripe.process.sync',
            iterator: data,
            properties: { collection, document, chargeDoc, user },
        });

        const updateResult = await updateMutator({
            collection,
            documentId: associatedDocument,
            data,
            validate: false,
            context,
        });

        returnDocument = updateResult.data;
        returnDocument.__typename = collection.typeName;
    }
    // Run vulcan callbacks
    runCallbacksAsync('stripe.process.async', {
        collection,
        returnDocument,
        chargeDoc,
        user: user,
        context,
    });

    return returnDocument;
};

/***********************************
 * vulcanCancelSubscription
 * 
 * Updates existing subscription status to cancelled
 * 
 * Called from graphqlStripeSubscription.js
 **********************************/

export const vulcanCancelSubscription = async (stripeObject, existingChargeDoc) => {

    //create the new charge by updating the old one where necessary
    let newChargeDoc = existingChargeDoc[existingChargeDoc.length - 1]
    newChargeDoc.status = 'canceled';//status has changed
    newChargeDoc.data = stripeObject;//update all the stripe data
    //new invoice url
    newChargeDoc.stripeChargeUrl = `https://dashboard.stripe.com/${!stripeObject.livemode && 'test/'}subscriptions/${stripeObject.id}`
    newChargeDoc.current_period_end = stripeObject.current_period_end;
    newChargeDoc.current_period_start = stripeObject.current_period_start;
    await updateMutator({
        collection: Charges,
        documentId: existingChargeDoc[existingChargeDoc.length - 1]._id,
        data: newChargeDoc,
        validate: false
    });

}

/**
 * Vulcan callbacks
 */
Meteor.startup(() => {
    registerCallback({
        name: 'stripe.receive.sync',
        description: "Modify any metadata before calling Stripe's API",
        arguments: [
            { metadata: 'Metadata about the action' },
            { user: 'The user' },
            { product: 'Product created with addProduct' },
            { collection: 'Associated collection of the charge' },
            { document: 'Associated document in collection to the charge' },
            { args: 'Original mutation arguments' },
        ],
        runs: 'sync',
        newSyntax: true,
        returns: 'The modified metadata to be sent to Stripe',
    });

    registerCallback({
        name: 'stripe.receive.async',
        description: "Run after calling Stripe's API",
        arguments: [
            { metadata: 'Metadata about the charge' },
            { user: 'The user' },
            { product: 'Product created with addProduct' },
            { collection: 'Associated collection of the charge' },
            { document: 'Associated document in collection to the charge' },
            { args: 'Original mutation arguments' },
        ],
        runs: 'sync',
        newSyntax: true,
    });

    registerCallback({
        name: 'stripe.charge.async',
        description: 'Perform operations immediately after the stripe subscription has completed',
        arguments: [
            { charge: 'The charge' },
            { collection: 'Associated collection of the subscription' },
            { document: 'Associated document in collection to the charge' },
            { args: 'Original mutation arguments' },
            { user: 'The user' },
        ],
        runs: 'async',
        newSyntax: true,
    });

    registerCallback({
        name: 'stripe.subscribe.async',
        description: 'Perform operations immediately after the stripe subscription has completed',
        arguments: [
            { subscription: 'The subscription' },
            { collection: 'Associated collection of the subscription' },
            { document: 'Associated document in collection to the charge' },
            { args: 'Original mutation arguments' },
            { user: 'The user' },
        ],
        runs: 'async',
        newSyntax: true,
    });

    registerCallback({
        name: 'stripe.process.sync',
        description: 'Modify any metadata before sending the charge to stripe',
        arguments: [
            {
                modifier: 'The modifier object used to update the associated collection',
            },
            { collection: 'Collection associated to the product' },
            { document: 'Associated document' },
            { chargeDoc: "Charge document returned by Stripe's API" },
            { user: 'The user' },
        ],
        runs: 'sync',
        returns: 'The modified arguments to be sent to stripe',
    });

    registerCallback({
        name: 'stripe.process.async',
        description: 'Modify any metadata before sending the charge to stripe',
        arguments: [
            { collection: 'Collection associated to the product' },
            { document: 'Associated document' },
            { chargeDoc: "Charge document returned by Stripe's API" },
            { user: 'The user' },
        ],
        runs: 'async',
        returns: 'The modified arguments to be sent to stripe',
    });

});
