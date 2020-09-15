import Users from 'meteor/vulcan:users';
import Charges from './charges/collection.js';

Users.addField([
  {
    fieldName: 'stripeCustomerId',
    fieldSchema: {
      type: String,
      optional: true,
      canRead: ['admins'],
      canUpdate: ['admins'],
    },
  },
  {
    fieldName: 'subscription',
    fieldSchema: {
      type: String,
      optional: true,
      canRead: ['members'],
      resolveAs: {
        fieldName: 'subscription',
        // fieldSchema: {
        type: 'String',
        resolver: async (post, args, { currentUser, Users }) => {
          // console.log(post._id)
          var doc = Charges.findOne({ associatedDocument: post._id });
          // console.log(doc)
          if ((doc && doc.data) && doc.data.plan) {
            // return doc.productKey
            return doc.data.plan.id
          } else return ''
        },
        addOriginalField: true
      },
    }
  },
]);
