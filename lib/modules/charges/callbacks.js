// import { addCallback, withCreate } from 'meteor/vulcan:core';
// import Charges from "./charges/collection.js";
// import { Utils } from 'meteor/vulcan:core';
import Users from 'meteor/vulcan:users';
import {
  updateMutator
} from 'meteor/vulcan:core';


/**
 * updateSubscriptionStatus
 * if subscription status updates, update corresponding user's group
 * hooked added in ./collection.js
 * 
 * @param {*} item 
 * @param {*} properties 
 */
export async function updateSubscriptionStatus(item, properties) {

  //get the subscription user's groups
  if (item.data && (item.data.data.metadata && item.data.status)) {

    const metadata = item.data.data.metadata
    const user = Users.findOne(metadata.userId)
    //if the updated subscription status is active, add the user to premium group
    if (item.data.status == 'active') {

      if ((user.groups && user.groups.indexOf('paidMembers') == -1)|| !user.groups) {
        let updatedGroups = null
        if(!user.groups){
          updatedGroups = ['paidMembers']
        }else{
          updatedGroups = [...user.groups, 'paidMembers'];
        }
       
        //remove from trialmembers
        const trialMemberIndex = updatedGroups.indexOf('trialMembers');
        if (trialMemberIndex > -1) {
          updatedGroups.splice(trialMemberIndex, 1);
        }

        //finally, update the user with new group
        await updateMutator({
          collection: Users,
          documentId: metadata.userId,
          data: { groups: updatedGroups },
          validate: false
        });
      }

    } else if (item.data.status == 'trialing') {

      if (user.groups.indexOf('trialMembers') == -1) {
        let updatedGroups = [...user.groups, 'trialMembers'];

        //cannot be a paid member if they are trialmember
        //use splice to remove 'paidMembers' group
        const paidMemberIndex = updatedGroups.indexOf('paidMembers');
        if (paidMemberIndex > -1) {
          updatedGroups.splice(paidMemberIndex, 1);
        }

        //finally, update the user with new group
        await updateMutator({
          collection: Users,
          documentId: metadata.userId,
          data: { groups: updatedGroups },
          validate: false
        });
      }

    }
    else if (item.data.status != 'canceled') {
      /**
       * else remove user from premium group (but NOT for cancelled!)
       * Cancelled members are still premium until the end of their billing period
       * Cancelled subscribers are removed from the premium group on login
       * - check if subscription end date> today date.
       */
      if (user.groups && user.groups.length) {
        var userGroups = user.groups
        //use splice to remove 'paidMembers' group
        const paidMembersIndex = userGroups.indexOf('paidMembers');
        if (paidMembersIndex > -1) {
          userGroups.splice(paidMembersIndex, 1);
        }
        //stop trial too
        const trialMembersIndex = userGroups.indexOf('trialMembers');
        if (trialMembersIndex > -1) {
          userGroups.splice(trialMembersIndex, 1);
        }

        //finally, update the user with new group
        await updateMutator({
          collection: Users,
          documentId: metadata.userId,
          data: { groups: userGroups },
          validate: false
        });
      }

    }
  }

}