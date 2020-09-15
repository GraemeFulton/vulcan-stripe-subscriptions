import React from 'react';
import PropTypes from 'prop-types';
import { Components, registerComponent, getSetting, withCurrentUser, withMessages, withMutation } from 'meteor/vulcan:core';
import { Products } from '../../modules/products.js';
import { withRouter } from 'react-router';

function CancelSubscriptionButton(props) {
    const handleClick = (evt) => {
        evt.preventDefault();

        if (window.confirm("Are you sure you want to cancel your subscription?")) {
            return props.stripeCancelSubscription()
                .then((response) => {
                    return response;
                })
                .then((cancelSubscriptionResponse) => {
                    // Display to the user that the subscription has been cancelled.
                    console.log(cancelSubscriptionResponse)
                    alert('cancelled')
                }).catch((error) => {
                    console.log(error);
                    alert(error)
                });
        } else {
            return false;
        }


    };

    return (
        //     <Components.Button variant="primary" onClick={(evt)=>handleClick(evt)} type="submit">
        //         Cancel subscription
        //   </Components.Button>
        <p><a onClick={(evt) => handleClick(evt)} className="text-sm text-gray-600 underline mt-4" href="#">Cancel subscription</a></p>
    );
}

const stripeCancelSubscription = {
    name: 'stripeCancelSubscription',
    args: { userId: 'String' }
};

registerComponent(
    {
        name: 'CancelSubscriptionButton',
        component: CancelSubscriptionButton,
        hocs: [withRouter, [withMutation, stripeCancelSubscription]]
    });

