(function () {
    let jQueryBopis;
    let $location;
    let backdrop;
    let currentProduct;

    // defining a global object having properties which let merchant configure some behavior
    this.bopisCustomConfig = {
        'enableCartRedirection': true
    };

    // TODO Generate instance specific code URL in FTL. Used with <#noparse> after this code so that `` code is escaped
    // let baseUrl = '<@ofbizUrl secure="true"></@ofbizUrl>';
    let baseUrl = '';

    let loadScript = function(url, callback){

        let script = document.createElement("script");
        script.type = "text/javascript";

        if (script.readyState){ 
            script.onreadystatechange = function(){
                if (script.readyState == "loaded" || script.readyState == "complete"){
                    script.onreadystatechange = null;
                    callback();
                }
            };
        } else {
            script.onload = function(){
                callback();
            };
        }
    
        script.src = url;
        document.getElementsByTagName("head")[0].appendChild(script);
        
    };

    // adding css in the current page
    let style = document.createElement("link");
    style.rel = 'stylesheet';
    style.type = 'text/css';
    style.href = `${baseUrl}/api/shopify-bopis.min.css`;

    document.getElementsByTagName("head")[0].appendChild(style);

    if ((typeof jQuery === 'undefined') || (parseFloat(jQuery.fn['jquery']) < 1.7)) {
        loadScript('//ajax.googleapis.com/ajax/libs/jquery/3.5.1/jquery.min.js', function(){
            jQueryBopis = jQuery.noConflict(true);
            jQueryBopis(document).ready(function() {
                initialiseBopis();
            });

        });
    } else {
        jQueryBopis = jQuery;
        jQuery(document).ready(function() {
            initialiseBopis();
        });
    }

    // function to get co-ordinates of the user after successfully getting the location
    function locationSuccess (pos) {
        $location = pos.coords;
    }

    // function to display error on console if having any error when getting the location
    function locationError (err) {
        console.error(err.code, err.message);
    }

    // will fetch the current location of the user
    function getCurrentLocation () {
        navigator.geolocation.getCurrentPosition(locationSuccess, locationError);
    }

    // function will open the modal for the bopis
    function openBopisModal (event) {
        const eventTarget = jQueryBopis(event.target);

        // to stop event bubbling when clicking on the Check Stores button
        event.preventDefault();
        event.stopImmediatePropagation();

        backdrop = jQueryBopis('<div id="hc-backdrop"></div>');
        jQueryBopis("body").append(backdrop);
        // add overflow style to disable background scroll when modal is opened
        jQueryBopis("body").css("overflow", "hidden");
        jQueryBopis(".hc-bopis-modal")[0].style.display = "block";
    }

    function closeBopisModal () {
        jQueryBopis(".hc-bopis-modal")[0].style.display = "none";
        jQueryBopis("body").css("overflow", "scroll");
        backdrop.remove();
    }

    async function getCurrentProduct() {
        await jQueryBopis.getJSON(`${window.location.pathname}.js`, function(product) {
            currentProduct = product;
        });
    }

    async function isProductAvailable(variantSku) {
        const hasInventoryOnShopify = jQueryBopis("input.hc_inventory").val() > 0
        return !!currentProduct && (hasInventoryOnShopify || currentProduct.variants.find((variant) => variant.sku == variantSku).inventory_policy === 'continue')
    }

    async function isProductProrderedOrBackordered (variantSku) {
        if (currentProduct.tags.includes('HC:Pre-Order') || currentProduct.tags.includes('HC:Backorder')) {
            return currentProduct.variants.find((variant) => variant.sku == variantSku).inventory_policy === 'continue'
        }
        return false;
    }

    async function initialiseBopis () {
        if (location.pathname.includes('products')) {
            await getCurrentProduct(); // fetch the information for the current product
            await getCurrentLocation();

            jQueryBopis(".hc-store-information").remove();
            jQueryBopis(".hc-bopis-modal").remove();

            // TODO Simplify this [name='id']. There is no need to serialize
            const cartForm = jQueryBopis(".hc-product-form");
            const sku = jQueryBopis("input.hc_product_sku").val();

            // Do not enable BOPIS when the current product is not available
            if(!(await isProductAvailable(sku))) return;

            const bopisButton = jQueryBopis("#hc-bopis-button");
            const existingBopisButton = jQueryBopis("#hc-bopis-button > button");

            // check if the product is Pre-order or backorder and having continue selling enabled and if yes, then do not enable bopis
            if (await isProductProrderedOrBackordered(meta.product.id, sku).catch(err => false)) return;

            let $pickUpModal = jQueryBopis(`<div id="hc-bopis-modal" class="hc-bopis-modal">
                <div class="hc-modal-content">
                    <div class="hc-modal-header">
                        <span class="hc-close"></span>
                        <h1 class="hc-modal-title">Pick up today</h1>
                    </div>
                    <form id="hc-bopis-form">
                        <input id="hc-bopis-store-pin" name="pin" placeholder="Enter zipcode"/>
                        <button type="submit" class="btn hc-bopis-pick-up-button">Find Stores</button>
                    </form>
                    <div class="hc-store-information"></div>
                    <p class="hc-store-not-found"></p>
                </div>
            </div>`);

            // check if the element with id hc-bopis-button has button element in it then don't add button
            if (existingBopisButton.length == 0) {
                let $btn = jQueryBopis('<button class="btn btn--secondary-accent hc-open-bopis-modal">Pick Up Today</button>');
                bopisButton.append($btn);
            }

            jQueryBopis("body").append($pickUpModal);

            bopisButton.on('click', openBopisModal);

            jQueryBopis(".hc-close").on('click', closeBopisModal);
            jQueryBopis(".hc-bopis-pick-up-button").on('click', handleAddToCartEvent);
            jQueryBopis("body").on('click', function(event) {
                if (event.target == jQueryBopis("#hc-bopis-modal")[0]) {
                    closeBopisModal();
                }
            })

            handleAddToCartEvent();

        } else if(location.pathname.includes('cart')) {
            // finding this property on cart page as some themes may display hidden properties on cart page
            jQueryBopis("[data-cart-item-property-name]:contains('pickupstore')").closest('li').hide();
        }
    }

    function getStoreInformation (queryString) {
        const payload = {
            viewSize: 100,
            keyword: queryString
        }

        if ($location) {
            payload["distance"] = 50
            payload["point"] = `${$location.latitude}, ${$location.longitude}`
        }

        // applied a condition that if we have location permission then searching the stores for the current location
        // if we have both location and pin, then using the pin to search for stores
        // if we doesn't have location permission and pin, then will fetch all the available stores
        return new Promise(function(resolve, reject) {
            jQueryBopis.ajax({
                type: 'POST',
                url: `${baseUrl}/api/storeLookup`,
                crossDomain: true,
                data: payload,
                success: function (res) {
                    resolve(res)
                },
                error: function (err, textStatus) {
                    reject(textStatus);
                }
            })
        })
    }

    async function checkInventory(payload) {
        const params = {
            filters: {
                sku: payload.sku,
                facilityId: payload.facilityIds,
                facilityId_op: 'in'
            },
            viewSize: payload.facilityIds.length
        }

        let resp;

        // added try catch to handle network related errors
        try {
            resp = await new Promise(function(resolve, reject) {
                jQueryBopis.ajax({
                    type: 'POST',
                    url: `${baseUrl}/api/checkInventory`,
                    crossDomain: true,
                    data: JSON.stringify(params),
                    dataType: 'JSON',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    success: function (data) {
                        resolve(data);
                    },
                    error: function (xhr, textStatus, exception) {
                        reject(textStatus)
                    }
                })
            })
        } catch (err) {
            resp = err;
        }
        return resp;
    }
    
    async function handleAddToCartEvent(event) {

        let eventTarget;
        if (event) {
            eventTarget = jQueryBopis(event.target);
            // to stop event bubbling when clicking on the Check Stores button
            event.preventDefault();
            event.stopImmediatePropagation();
        }

        const queryString = jQueryBopis("#hc-bopis-store-pin").val();
        let storeInformation = await getStoreInformation(queryString).then(data => data).catch(err => err);
        let result = '';

        const sku = jQueryBopis("input.hc_product_sku").val();

        jQueryBopis('#hc-store-card').remove();
        if (event) eventTarget.prop("disabled", true);

        // checking if the number of stores is greater then 0 then creating a payload to check inventory
        if (storeInformation && storeInformation.response && storeInformation.response.numFound > 0) {

            let storeCodes = storeInformation.response.docs.map((store) => {
                let storeCode = '';

                // if storeCode starts with DC_ then removing the code
                if (store.storeCode.startsWith('DC_')) {
                    storeCode = store.storeCode.substring(3);
                } else {
                    storeCode = store.storeCode;
                }

                store.storeCode = storeCode;
                return storeCode;
            })

            // passing the facilityId as an array in the payload
            let payload = {"sku" : sku, "facilityIds": storeCodes};
            result = await checkInventory(payload)

            // mapping the inventory result with the locations to filter those stores whose inventory
            // is present and the store code is present in the locations.
            if (result.docs) {
                result = storeInformation.response.docs.filter((location) => {
                    return result.docs.some((doc) => {
                        return doc.facilityId === location.storeCode && doc.atp > 0;
                    })
                })
            }
        }

        displayStoreInformation(result)
        if (event) eventTarget.prop("disabled", false);
    }

    function getDay () {
        let days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
        let date = new Date();
        let dayName = days[date.getDay()];
        return dayName;
    }

    function openData (regularHours) {
        return regularHours.periods.find(period => period.openDay === getDay());
    }

    function tConvert (time) {
        if (time) {
            // Check correct time format and split into components
            time = time.toString().match(/^([01]\d|2[0-3])(:)([0-5]\d)(:[0-5]\d)?$/) || [time];
    
            if (time.length > 1) { // If time format correct
                time = time.slice(1); // Remove full string match value
                time[5] = +time[0] < 12 ? 'am' : 'pm'; // Set AM/PM
                time[0] = +time[0] % 12 || 12; // Adjust hours
            }
            return time.join(''); // return adjusted time or original string
        }
    }

    // will check for the inventory for the product stock and if available then display the information on the UI
    function displayStoreInformation(result) {

        jQueryBopis('.hc-store-information').empty();
        // TODO Handle it in a better way
        // The content of error is not removed and appended to last error message
        jQueryBopis('.hc-store-not-found').remove();
        jQueryBopis('.hc-modal-content').append(jQueryBopis('<p class="hc-store-not-found"></p>'));
        const hcModalContent = jQueryBopis('.hc-modal-content')
    
        //check for result count, result count contains the number of stores count in result
        //TODO: find a better approach to handle the error secenario
        if (result.length > 0 && !result.includes('error')) {
            result.map(async (store) => {
                let $storeCard = jQueryBopis('<div id="hc-store-card"></div>');
                let $storeInformationCard = jQueryBopis(`
                <div id="hc-store-details">
                    <div id="hc-details-column"><h4 class="hc-store-title">${store.storeName ? store.storeName : ''}</h4><p>${store.address1 ? store.address1 : ''}</p><p>${store.city ? store.city : ''} ${store.stateCode ? `, ${store.stateCode}` : ''} ${store.postalCode ? `, ${store.postalCode}` : ''} ${store.countryCode ? `, ${store.countryCode}` : ''}</p></div>
                    <div id="hc-details-column"><p>In stock</p><p>${store.storePhone ? store.storePhone : ''}</p><p>${ store.regularHours ? 'Open Today: ' + tConvert(openData(store.regularHours).openTime) + ' - ': ''} ${store.regularHours ? tConvert(openData(store.regularHours).closeTime) : ''}</p></div>
                </div>`);

                let $pickUpButton = jQueryBopis('<button class="btn btn--secondary-accent hc-store-pick-up-button">Pick Up Here</button>');
                $pickUpButton.on("click", updateCart.bind(null, store));

                let $lineBreak = jQueryBopis('<hr/>')

                $storeCard.append($storeInformationCard);
                $storeCard.append($pickUpButton);
                $storeCard.append($lineBreak);

                jQueryBopis('.hc-store-information').append($storeCard);
            })

            //check whether the storeCard contains any children, if not then displaying error
            if (!jQueryBopis('.hc-store-information').children().length) {
                jQueryBopis('.hc-store-not-found').html('No stores found for this product');
            }
        } else {
            jQueryBopis('.hc-store-not-found').append('No stores found for this product');
        }

        // hide all the h4 and p tags which are empty in the modal
        hcModalContent.find('h4:empty').hide();
        hcModalContent.find('p:empty').hide();
    }
    
    // will add product to cart with a custom property pickupstore
    function updateCart(store, event) {

        let addToCartForm = jQueryBopis(".hc-product-form");

        event.preventDefault();
        event.stopImmediatePropagation();
                
        // let merchant define the behavior whenever pick up button is clicked, merchant can define an event listener for this event
        jQueryBopis(document).trigger('prePickUp');

        // made the property hidden by adding underscore before the property name
        let facilityIdInput = jQueryBopis(`<input id="hc-store-code" name="properties[_pickupstore]" value=${store.storeCode ? store.storeCode : ''} type="hidden"/>`)
        addToCartForm.append(facilityIdInput)

        let facilityNameInput = jQueryBopis(`<input id="hc-pickupstore-address" name="properties[Pickup Store]" value="${store.storeName ? store.storeName : ''} ${store.address1 ? `, ${store.address1}` : ''} ${store.city ? `, ${store.city}` : ''}" type="hidden"/>`)
        addToCartForm.append(facilityNameInput)

        // using the cart add endpoint to add the product to cart, as using the theme specific methods is not recommended.
        jQueryBopis.ajax({
            type: "POST",
            url: '/cart/add.js',
            data: addToCartForm.serialize(),
            dataType: 'JSON',
            success: function () {

                // let merchant define the behavior after the item is successfully added as a pick up item, merchant can define an event listener for this event
                jQueryBopis(document).trigger('postPickUp');

                // redirecting the user to the cart page after the product gets added to the cart
                if (bopisCustomConfig.enableCartRedirection) {
                    location.replace('/cart');
                }
            }
        })

        facilityIdInput.remove();
        facilityNameInput.remove();
    }
    // TODO move it to intialise block
    // To check whether the url has changed or not, for making sure that the variant is changed.
    let url = location.href; 
    new MutationObserver(() => {
        if (location.href !== url) {
            url = location.href;
            initialiseBopis();
        }
        // added condition to run the script again as when removing a product the script does not run
        // and thus the store id again becomes visible
        if (location.pathname.includes('cart')) initialiseBopis();
    }).observe(document, {subtree: true, childList: true});

})();