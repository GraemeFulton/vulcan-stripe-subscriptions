// The main Charges collection definition file.
import { createCollection, getDefaultResolvers } from 'meteor/vulcan:core';
import schema from './schema.js';
import Users from 'meteor/vulcan:users';
import {updateSubscriptionStatus} from './callbacks'

const Charges = createCollection({
  collectionName: 'Charges',

  typeName: 'Charge',

  schema,

  resolvers: getDefaultResolvers('Charges'),

  mutations: null,

  defaultInput: {
    sort: {
      createdAt: 'desc',
    },
  },

  callbacks: {
    create: {
      async: [updateSubscriptionStatus]
    },
    update: {
      async: [updateSubscriptionStatus],
    }
  },

});

Charges.addDefaultView(terms => {
  return {
    options: { sort: { createdAt: -1 } },
  };
});

Charges.checkAccess = (currentUser, charge) => {
  var canReadField = false
  if(currentUser._id == charge.associatedDocument){    
    canReadField =  true
    // Users.canReadField(currentUser, 'latest_invoice', charge);
  }

  return Users.isAdmin(currentUser) || canReadField
};

export default Charges;
