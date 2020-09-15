import { addGraphQLSchema, addGraphQLResolvers, addGraphQLMutation, Collections, addCallback, Connectors } from 'meteor/vulcan:core';
import Users from 'meteor/vulcan:users';
import { createStripeCustomer, getStripeCustomerId } from './graphqlHelpers/graphqlStripeCustomer';
import { createStripeSubscription, retryStripeSubscription, cancelStripeSubscription } from './graphqlHelpers/graphqlStripeSubscription';
import Charges from '../modules/charges/collection.js';

import { vulcanUpdateSubscription } from './vulcanSubscriptionHelpers/vulcanSubscriptionHelpers.js'
import { getCollection } from 'meteor/vulcan:lib'

//craete customer mutation
addGraphQLMutation('stripeCreateCustomer(email: String) : JSON');

addGraphQLMutation(
    'stripeCreateSubscription(customerId: String, paymentMethodId:String, product:JSON, '
    + 'associatedCollection: String, associatedDocument: String, '
    + 'retry: Boolean, invoiceId: String, userId: String ) : JSON');

addGraphQLMutation('stripeCancelSubscription(userId: String): JSON');

addGraphQLMutation('isSubscriptionActive(userId: String): JSON');

const resolver = {
    Mutation: {
        /***********************************
         * stripeCreateCustomer graphQL mutation - 
         * args = email: String
         * uses graphqlStripeCustomer.js 
         * 
         * getStripeCustomerId: 
         *  - check if vulcan user is a stripe customer 
         *  - return stripeCustomerId
         * createStripeCustomer: 
         *  - if vulcan user has no stripeCustomerID create new customer
         *  - return stripeCustomerId
         **********************************/
        async stripeCreateCustomer(root, args, context) {
            //check if user is a stripe customer
            const existingCustomerId = await getStripeCustomerId(args, context);
            if (existingCustomerId) { return { stripeCustomerId: existingCustomerId } }

            //if no existingCustomerId, create and a new stripe customer and return new id
            const newCustomerId = await createStripeCustomer(args, context);
            if (newCustomerId) {
                //customerData has all the customer information
                //return customer id to checkout form, which is used to create the payment
                return { stripeCustomerId: newCustomerId }
            } else {
                throw new Error('No Customer ID');
            }
        },
        /***********************************
         * stripeCreateSubscription graphQL mutation -
         * args = customerId: String, paymentMethodId:String, product:JSON, retry: Boolean
         * uses graphqlStripePayment.js
         * 
         * createStripeSubscription:
         *  - creates the subscription
         *  - returns subscription object
         **********************************/
        async stripeCreateSubscription(root, args, context) {

            //if retrying a failed payment
            if (args.retry == true) {
                const invoiceObject = await retryStripeSubscription(args, context)

                if (invoiceObject) {
                    return { invoice: invoiceObject }
                } else {
                    throw new Error('Error processing payment');
                }

            } else {
                //otherwise create new subscription
                const stripeSubscriptionObject = await createStripeSubscription(args, context)

                if (stripeSubscriptionObject) {
                    return { subscription: stripeSubscriptionObject }
                } else {
                    throw new Error('Error processing payment');
                }
            }

        },
        /***********************************
         * stripeCancelSubscription graphQL mutation -
         * args = -
         * uses graphqlStripePayment.js
         * 
         * cancelStripeSubscription:
         *  - creates the subscription
         *  - returns subscription object
         **********************************/
        async stripeCancelSubscription(root, args, context) {

            //cancle subscritpion via stripe api delete subscription
            const deletedSubscription = await cancelStripeSubscription(args, context)

            if (deletedSubscription) {
                return { subscription: deletedSubscription }
            } else {
                throw new Error('Error processing cancellation');
            }


        },
        /***********************************
         * isSubscriptionActive graphQL mutation
         *
         * this one doesn't use stripe api
         * checks if subscription is active or not
         * @return bool: true or false
         **********************************/
        async isSubscriptionActive(root, args, context) {
            //if there's no user it's always false
            if (!context.currentUser) {
                return false
            }
            const userId = context.currentUser._id
            //find most recent active subscription charge
            let chargeDocs = await Connectors.find(Charges, {
                'userId': userId,
                'data.status': 'active',
                'data.object': 'subscription'
            });
            //if no active subscription, the user is not valid
            if (!chargeDocs.length) {

                //get cancelled charges (cancelled charges are still active subscriptions until the expiry daye)
                chargeDocs = await Connectors.find(Charges, {
                    'userId': userId,
                    'data.status': 'canceled',
                    'data.object': 'subscription'
                });
                if (!chargeDocs.length) {
                    return isValid = false
                }

            }
            //get the most recent active subscription (should be one, but during testing, there can be a few)
            const chargeDoc = chargeDocs[chargeDocs.length - 1]
            if (chargeDoc && ((chargeDoc.status == 'active' || chargeDoc.status == 'trialing') || chargeDoc.status=='canceled')) {
                //get the timestamps to compare
                let periodEndDateTimeStamp = chargeDoc.current_period_end
                var date = new Date();
                //subtract 1 day to give user an extra day leeway
                date.setDate(date.getDate() - 1);
                // Get the time value in milliseconds and convert to seconds
                var currentTimeStamp = date / 1000 | 0;
                //if the current time is after the subscription end date, the subscription is invalid
                if (currentTimeStamp > periodEndDateTimeStamp) {
                    // console.log('current timestamp is greater than the end date')
                    /**
                     * the subscription is active/trialing, but has expired. Set status to expired!
                     * (happens when user cancelled subscription, as subscription must stay active until
                     * period end date has passed)
                     */
                    const args = {
                        userId: chargeDoc.data.metadata.userId,
                        vulcanProductKey: chargeDoc.data.metadata.vulcanProductKey,
                        associatedCollection: chargeDoc.data.metadata.associatedCollection,
                        associatedDocument: chargeDoc.data.metadata.associatedDocument,
                        livemode: !chargeDoc.test
                    };
                    const collection = getCollection(chargeDoc.data.metadata.associatedCollection)
                    const document = await Connectors.get(collection, chargeDoc.data.metadata.associatedDocument);
                    var expiredStripeObject = chargeDoc.data
                    //manually update the status to expired
                    expiredStripeObject.status = 'expired'
                    //save in db
                    await vulcanUpdateSubscription({ stripeObject: expiredStripeObject, userId, args, collection, document })
                    //the user group will be updated from the updateCharge callback added in the charges collection
                    return isValid = false
                }
                const stripeObject = chargeDoc.data
                //now check the usergroup currentuser in group 'paidMembers', return true
                if (stripeObject.metadata) {
                    const metadata = stripeObject.metadata
                    const user = Users.findOne(metadata.userId)

                    if (Users.isMemberOf(user, 'paidMembers') || Users.isMemberOf(user, 'trialMembers')) {
                        // console.log('premium member')
                        return isValid = true
                    }else{
                        return isValid = false
                    }

                }
                return isValid
            }
        },
    },
};
addGraphQLResolvers(resolver);

/**
 * CreateChargeableUnionType
 * 
 * Not sure what this does - copied from old vulcan:payments package
 * Something to do with the Charges collection?
 * 
 * @TODO find out wha this is doing
 */
function CreateChargeableUnionType() {
    const chargeableSchema = `union Chargeable = ${Collections.map(collection => collection.typeName).join(' | ')}`;
    addGraphQLSchema(chargeableSchema);
    return {};
}
addCallback('graphql.init.before', CreateChargeableUnionType);

const resolverMap = {
    Chargeable: {
        __resolveType(obj, context, info) {
            return obj.__typename || null;
        },
    },
};
addGraphQLResolvers(resolverMap);