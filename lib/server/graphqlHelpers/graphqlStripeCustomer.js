import {
    getSetting,
    registerSetting,
    createMutator,
    updateMutator,
    runGraphQL,
    webAppConnectHandlersUse
} from 'meteor/vulcan:core';

import Users from 'meteor/vulcan:users';
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


/***********************************
 * getStripeCustomerId
 * 
 * check if the current user has a stripeCustomerId
 * returns: stripe customer ID or false
 * 
 **********************************/
export const getStripeCustomerId = async (args, context) => {

    //if there's a current user and the current user has a strip id
    if (context.currentUser && context.currentUser.stripeCustomerId) {
        //return their stripe id
        return context.currentUser.stripeCustomerId
    } else {
        //or return false
        return false
    }
}
/***********************************
 * createStripeCustomer
 * 
 * uses stripe npm package to create a customer
 * on customer created, store id to vulcan user 
 * 
 **********************************/
export const createStripeCustomer = async (args, context) => {

    if (!stripeSettings) {
        throw new Error('Stripe settings not valid');
    }

    const currentUserEmail = context.currentUser.email;
    const customer = await stripe.customers.create({
        // email: args.email
        email: currentUserEmail
    });

    //update Vulcan user with customerId (code from vulcan:payemnts)
    // add stripe customer id to user object
   await updateMutator({
        collection: Users,
        documentId: context.currentUser._id,
        data: { stripeCustomerId: customer.id },
        validate: false,
    });

    //find the user to check if they're updated with the new stripe customer id
    const updatedUser = Users.findOne(context.currentUser._id)
    const stripeCustomerId = updatedUser.stripeCustomerId
    
    //alternatively, could just return the customer id - checking in the db may be overkill
    // const stripeCustomerId =  customer.id

    //return the stripe customerID attached in the database
    if(stripeCustomerId){
        return stripeCustomerId
    }else{
        throw new Error('Failed to create a new customer.');
    }
    
}