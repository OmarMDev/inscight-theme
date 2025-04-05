(function () {
  const cartItemsElement = document.querySelector("cart-items") || document.querySelector("cart-drawer-items");
  const atcItemFeatureIsEnabled = cartItemsElement?.dataset.enableConditionalAtcItem === "true";

  if (atcItemFeatureIsEnabled && typeof window.userRemovedAutoAtcItem === "undefined") {
    const stored = localStorage.getItem("userRemovedAutoAtcItemData");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        const now = Date.now();
        if (parsed.value === true && parsed.expiresAt && now < parsed.expiresAt) {
          window.userRemovedAutoAtcItem = true;
        } else {
          window.userRemovedAutoAtcItem = false;
          localStorage.removeItem("userRemovedAutoAtcItemData");
        }
      } catch (err) {
        window.userRemovedAutoAtcItem = false;
        localStorage.removeItem("userRemovedAutoAtcItemData");
      }
    } else {
      window.userRemovedAutoAtcItem = false;
    }
  }
})();

class CartRemoveButton extends HTMLElement {
  constructor() {
    super();

    const cartItemsElem = this.closest("cart-items") || this.closest("cart-drawer-items");
    if (cartItemsElem && cartItemsElem.dataset.enableConditionalAtcItem === "true" && this.isAtcItemVariant(cartItemsElem, this.dataset.variantId)) {
      window.userRemovedAutoAtcItem = true;
      const oneDayMs = 24 * 60 * 60 * 1000;
      const expiresAt = Date.now() + oneDayMs;
      const dataToStore = { value: true, expiresAt };
      localStorage.setItem("userRemovedAutoAtcItemData", JSON.stringify(dataToStore));
    }

    this.addEventListener("click", (event) => {
      event.preventDefault();
      const cartItems = this.closest("cart-items") || this.closest("cart-drawer-items");
      cartItems.updateQuantity(this.dataset.index, 0, event);
    });
  }

  isAtcItemVariant(cartItemsElem, variantId) {
    const atcItemVariantsCsv = cartItemsElem.dataset.atcItemVariantToAdd || "";
    const atcItemVariantsArray = atcItemVariantsCsv
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const isAtcItem = atcItemVariantsArray.includes(String(variantId));
    return isAtcItem;
  }
}

customElements.define("cart-remove-button", CartRemoveButton);

class CartItems extends HTMLElement {
  constructor() {
    super();
    this.lineItemStatusElement = document.getElementById("shopping-cart-line-item-status") || document.getElementById("CartDrawer-LineItemStatus");

    const debouncedOnChange = debounce((event) => {
      this.onChange(event);
    }, ON_CHANGE_DEBOUNCE_TIMER);

    this.addEventListener("change", debouncedOnChange.bind(this));
  }

  cartUpdateUnsubscriber = undefined;
  isForcedCartUpdate = false;

  connectedCallback() {
    this.cartUpdateUnsubscriber = subscribe(PUB_SUB_EVENTS.cartUpdate, (event) => {
      if (event.source === "cart-items") {
        return;
      }

      if (this.dataset.enableConditionalAtcItem === "true" && this.tagName === "CART-ITEMS") {
        this.checkConditionalAtcOnInitialLoad();
      }

      return this.onCartUpdate();
    });
  }

  disconnectedCallback() {
    if (this.cartUpdateUnsubscriber) {
      this.cartUpdateUnsubscriber();
    }
  }

  resetQuantityInput(id) {
    const input = this.querySelector(`#Quantity-${id}`);
    input.value = input.getAttribute("value");
    this.isEnterPressed = false;
  }

  setValidity(event, index, message) {
    event.target.setCustomValidity(message);
    event.target.reportValidity();
    this.resetQuantityInput(index);
    event.target.select();
  }

  validateQuantity(event) {
    const inputValue = parseInt(event.target.value);
    const index = event.target.dataset.index;
    let message = "";

    if (inputValue < event.target.dataset.min) {
      message = window.quickOrderListStrings.min_error.replace("[min]", event.target.dataset.min);
    } else if (inputValue > parseInt(event.target.max)) {
      message = window.quickOrderListStrings.max_error.replace("[max]", event.target.max);
    } else if (inputValue % parseInt(event.target.step) !== 0) {
      message = window.quickOrderListStrings.step_error.replace("[step]", event.target.step);
    }

    if (message) {
      this.setValidity(event, index, message);
    } else {
      event.target.setCustomValidity("");
      event.target.reportValidity();
      this.updateQuantity(index, inputValue, event, document.activeElement.getAttribute("name"), event.target.dataset.quantityVariantId);
    }
  }

  onChange(event) {
    this.validateQuantity(event);
  }

  onCartUpdate() {
    if (this.tagName === "CART-DRAWER-ITEMS") {
      return fetch(`${routes.cart_url}?section_id=cart-drawer`)
        .then((response) => response.text())
        .then((responseText) => {
          const html = new DOMParser().parseFromString(responseText, "text/html");
          const selectors = ["cart-drawer-items", ".cart-drawer__footer"];
          for (const selector of selectors) {
            const targetElement = document.querySelector(selector);
            const sourceElement = html.querySelector(selector);
            if (targetElement && sourceElement) {
              targetElement.replaceWith(sourceElement);
            }
          }
        })
        .then(() => {
          if (!this.isForcedCartUpdate && this.dataset.enableConditionalAtcItem === "true") {
            fetch(`${routes.cart_url}.js`, { ...fetchConfig("json") })
              .then((resp) => resp.json())
              .then((cartData) => {
                const pseudoParsedState = { items: cartData.items };
                this.handleConditionalAtcItem(pseudoParsedState);
              });
          }
        })

        .catch((e) => {
          console.error(e);
        });
    } else {
      return fetch(`${routes.cart_url}?section_id=main-cart-items`)
        .then((response) => response.text())
        .then((responseText) => {
          const html = new DOMParser().parseFromString(responseText, "text/html");
          const sourceQty = html.querySelector("cart-items");
          this.innerHTML = sourceQty.innerHTML;
        })
        .then(() => {
          if (!this.isForcedCartUpdate && this.dataset.enableConditionalAtcItem === "true") {
            fetch(`${routes.cart_url}.js`, { ...fetchConfig("json") })
              .then((resp) => resp.json())
              .then((cartData) => {
                const pseudoParsedState = { items: cartData.items };
                this.handleConditionalAtcItem(pseudoParsedState);
              });
          }
        })

        .catch((e) => {
          console.error(e);
        });
    }
  }

  getSectionsToRender() {
    return [
      {
        id: "main-cart-items",
        section: document.getElementById("main-cart-items").dataset.id,
        selector: ".js-contents",
      },
      {
        id: "cart-icon-bubble",
        section: "cart-icon-bubble",
        selector: ".shopify-section",
      },
      {
        id: "cart-live-region-text",
        section: "cart-live-region-text",
        selector: ".shopify-section",
      },
      {
        id: "main-cart-footer",
        section: document.getElementById("main-cart-footer").dataset.id,
        selector: ".js-contents",
      },
    ];
  }

  updateQuantity(line, quantity, event, name, variantId) {
    if (this.isForcedCartUpdate) {
      return;
    }

    this.enableLoading(line);

    const body = JSON.stringify({
      line,
      quantity,
      sections: this.getSectionsToRender().map((section) => section.section),
      sections_url: window.location.pathname,
    });
    const eventTarget = event.currentTarget instanceof CartRemoveButton ? "clear" : "change";

    fetch(`${routes.cart_change_url}`, { ...fetchConfig(), ...{ body } })
      .then((response) => {
        return response.text();
      })
      .then((state) => {
        const parsedState = JSON.parse(state);

        CartPerformance.measure(`${eventTarget}:paint-updated-sections"`, () => {
          const quantityElement = document.getElementById(`Quantity-${line}`) || document.getElementById(`Drawer-quantity-${line}`);
          const items = document.querySelectorAll(".cart-item");

          if (parsedState.errors) {
            quantityElement.value = quantityElement.getAttribute("value");
            this.updateLiveRegions(line, parsedState.errors);
            return;
          }

          this.classList.toggle("is-empty", parsedState.item_count === 0);
          const cartDrawerWrapper = document.querySelector("cart-drawer");
          const cartFooter = document.getElementById("main-cart-footer");

          if (cartFooter) cartFooter.classList.toggle("is-empty", parsedState.item_count === 0);
          if (cartDrawerWrapper) cartDrawerWrapper.classList.toggle("is-empty", parsedState.item_count === 0);

          this.getSectionsToRender().forEach((section) => {
            const elementToReplace = document.getElementById(section.id).querySelector(section.selector) || document.getElementById(section.id);
            elementToReplace.innerHTML = this.getSectionInnerHTML(parsedState.sections[section.section], section.selector);
          });
          const updatedValue = parsedState.items[line - 1] ? parsedState.items[line - 1].quantity : undefined;
          let message = "";
          if (items.length === parsedState.items.length && updatedValue !== parseInt(quantityElement.value)) {
            if (typeof updatedValue === "undefined") {
              message = window.cartStrings.error;
            } else {
              message = window.cartStrings.quantityError.replace("[quantity]", updatedValue);
            }
          }
          this.updateLiveRegions(line, message);

          const lineItem = document.getElementById(`CartItem-${line}`) || document.getElementById(`CartDrawer-Item-${line}`);
          if (lineItem && lineItem.querySelector(`[name="${name}"]`)) {
            cartDrawerWrapper ? trapFocus(cartDrawerWrapper, lineItem.querySelector(`[name="${name}"]`)) : lineItem.querySelector(`[name="${name}"]`).focus();
          } else if (parsedState.item_count === 0 && cartDrawerWrapper) {
            trapFocus(cartDrawerWrapper.querySelector(".drawer__inner-empty"), cartDrawerWrapper.querySelector("a"));
          } else if (document.querySelector(".cart-item") && cartDrawerWrapper) {
            trapFocus(cartDrawerWrapper, document.querySelector(".cart-item__name"));
          }
        });

        CartPerformance.measureFromEvent(`${eventTarget}:user-action`, event);

        this.updateProgressBar({ items: parsedState.items });

        publish(PUB_SUB_EVENTS.cartUpdate, { source: "cart-items", cartData: parsedState, variantId: variantId });

        const { enableConditionalAtcItem } = this.getConditionalAtcItemSettings();
        if (enableConditionalAtcItem) {
          this.handleConditionalAtcItem(parsedState);
        }
      })

      .catch(() => {
        this.querySelectorAll(".loading__spinner").forEach((overlay) => overlay.classList.add("hidden"));
        const errors = document.getElementById("cart-errors") || document.getElementById("CartDrawer-CartErrors");
        errors.textContent = window.cartStrings.error;
      })
      .finally(() => {
        this.disableLoading(line);
      });
  }

  updateProgressBar({ items }) {
    const progressWrapper = document.getElementById("cart-progress-wrapper");
    if (!progressWrapper) return;

    const progressBarBasis = progressWrapper.dataset.progressBarBasis;
    const excludedProducts = progressWrapper.dataset.excludedProductIds
      ? progressWrapper.dataset.excludedProductIds
          .split(",")
          .map((id) => id.trim())
          .filter(Boolean)
      : [];

    const currencyFormat = progressWrapper.dataset.currencyFormat;
    const thresholds = progressWrapper.dataset.thresholds.split(",").map(Number);
    const preGoalMessages = progressWrapper.dataset.preGoalMessages.split("||");
    const postGoalMessages = progressWrapper.dataset.postGoalMessages.split("||");
    const goalPositions = progressWrapper.dataset.goalPositions ? progressWrapper.dataset.goalPositions.split(",").map(Number) : [];
    const goalBases = progressWrapper.dataset.goalBases ? progressWrapper.dataset.goalBases.split(",") : [];

    let itemCountMetric = 0;
    let excludedSubtotalMetric = 0;
    let excludedTotalMetric = 0;

    for (const item of items) {
      if (!excludedProducts.includes(item.product_id.toString())) {
        itemCountMetric += item.quantity;
        excludedSubtotalMetric += item.original_line_price;
        excludedTotalMetric += item.line_price;
      }
    }

    let cartMetric;
    if (progressBarBasis === "item_count") {
      cartMetric = itemCountMetric;
    } else {
      cartMetric = excludedTotalMetric;
    }

    const totalThreshold = thresholds.length > 0 ? thresholds[thresholds.length - 1] : 0;
    if (thresholds.length === 0 || totalThreshold === 0) {
      progressWrapper.style.display = "none";
      return;
    }

    const segmentsContainer = progressWrapper.querySelector(".cart-segments-container");
    if (!segmentsContainer) return;

    const segmentElements = segmentsContainer.querySelectorAll(".cart-segment");
    const goalIcons = progressWrapper.querySelectorAll(".goal-icon");
    const goalMessageElement = progressWrapper.querySelector(".goal-message");

    if (cartMetric === 0 && progressBarBasis === "item_count") {
      progressWrapper.style.display = "none";
      if (goalMessageElement) goalMessageElement.style.display = "none";
      segmentElements.forEach((segment) => {
        const fill = segment.querySelector(".cart-segment-fill");
        if (fill) fill.style.width = "0%";
      });
      return;
    }

    progressWrapper.style.display = "block";

    let previousSegmentValue = 0;
    segmentElements.forEach((segmentElement, index) => {
      const segmentFill = segmentElement.querySelector(".cart-segment-fill");
      if (!segmentFill) return;

      let segmentMetricValue;
      if (progressBarBasis === "item_count") {
        segmentMetricValue = itemCountMetric;
      } else {
        const segmentBasis = goalBases[index] || "total";
        segmentMetricValue = segmentBasis === "subtotal" ? excludedSubtotalMetric : excludedTotalMetric;
      }

      const currentThreshold = thresholds[index];
      let fillPercentage = 0;

      if (segmentMetricValue <= previousSegmentValue) {
        fillPercentage = 0;
      } else if (segmentMetricValue >= currentThreshold) {
        fillPercentage = 100;
      } else {
        const segmentRange = currentThreshold - previousSegmentValue;
        const filledAmount = segmentMetricValue - previousSegmentValue;
        fillPercentage = Math.min((filledAmount / segmentRange) * 100, 100);
      }

      segmentFill.style.width = fillPercentage + "%";
      previousSegmentValue = currentThreshold;
    });

    let nextGoalIndex = -1;
    for (let i = 0; i < thresholds.length; i++) {
      let metricForGoal;
      if (progressBarBasis === "item_count") {
        metricForGoal = itemCountMetric;
      } else {
        const goalBasis = goalBases[i] || "total";
        metricForGoal = goalBasis === "subtotal" ? excludedSubtotalMetric : excludedTotalMetric;
      }

      if (metricForGoal < thresholds[i]) {
        nextGoalIndex = i;
        break;
      }
    }

    goalIcons.forEach((goalIcon, index) => {
      let iconMetric;
      if (progressBarBasis === "item_count") {
        iconMetric = itemCountMetric;
      } else {
        const goalBasis = goalBases[index] || "total";
        iconMetric = goalBasis === "subtotal" ? excludedSubtotalMetric : excludedTotalMetric;
      }

      const cartTotalDiff = iconMetric - thresholds[index];
      const icon = goalIcon.querySelector("img");
      const goalNumber = goalIcon.dataset.index;

      if (icon) {
        if (cartTotalDiff < 0) {
          const regularIconUrl = goalIcon.dataset.regularIcon;
          if (regularIconUrl) {
            icon.src = regularIconUrl;
            icon.srcset = `${regularIconUrl} 50w`;
            icon.alt = `Goal ${goalNumber}`;
          }
        } else {
          const reachedIconUrl = goalIcon.dataset.reachedIcon;
          if (reachedIconUrl) {
            icon.src = reachedIconUrl;
            icon.srcset = `${reachedIconUrl} 50w`;
            icon.alt = `Goal ${goalNumber} Reached`;
          }
        }
      }
    });

    if (goalMessageElement) {
      goalMessageElement.style.display = "block";
      if (nextGoalIndex === -1) {
        const message = postGoalMessages[postGoalMessages.length - 1];
        goalMessageElement.innerHTML = message;
        progressWrapper.classList.add("full");
      } else {
        progressWrapper.classList.remove("full");
        let metricForMessage;
        if (progressBarBasis === "item_count") {
          metricForMessage = itemCountMetric;
        } else {
          const msgBasis = goalBases[nextGoalIndex] || "total";
          metricForMessage = msgBasis === "subtotal" ? excludedSubtotalMetric : excludedTotalMetric;
        }

        const remainingForGoal = thresholds[nextGoalIndex] - metricForMessage;
        if (progressBarBasis === "item_count") {
          const preGoalMessageTemplate = preGoalMessages[nextGoalIndex];
          const message = preGoalMessageTemplate.replace("[remaining_for_goal]", remainingForGoal < 0 ? 0 : remainingForGoal);
          goalMessageElement.innerHTML = message;
        } else {
          const remainingAmount = Math.max(0, remainingForGoal) / 100;
          const remainingAmountFormatted = this.formatCurrency(currencyFormat, remainingAmount);
          const preGoalMessageTemplate = preGoalMessages[nextGoalIndex];
          const message = preGoalMessageTemplate.replace("[remaining_for_goal]", remainingAmountFormatted);
          goalMessageElement.innerHTML = message;
        }
      }
    }
  }

  formatCurrency(currencyFormat, amount) {
    let formattedAmount = "";
    formattedAmount = currencyFormat
      .replace("{{amount}}", amount.toFixed(2)) // Standard with two decimals
      .replace("{{amount_no_decimals}}", amount.toFixed(0)) // No decimals
      .replace("{{amount_with_comma_separator}}", amount.toFixed(2).replace(".", ",")) // Replace period with comma
      .replace("{{amount_no_decimals_with_comma_separator}}", amount.toFixed(0).replace(".", ",")) // No decimals, use comma
      .replace("{{amount_with_apostrophe_separator}}", amount.toFixed(2).replace(".", "'")) // Apostrophe separator
      .replace("{{amount_no_decimals_with_space_separator}}", amount.toFixed(0).replace(/\\B(?=(\\d{3})+(?!\\d))/g, " ")) // No decimals, space
      .replace(
        "{{amount_with_space_separator}}",
        amount
          .toFixed(2)
          .replace(/\\B(?=(\\d{3})+(?!\\d))/g, " ")
          .replace(".", ",")
      ) // Space separator
      .replace("{{amount_with_period_and_space_separator}}", amount.toFixed(2).replace(/\\B(?=(\\d{3})+(?!\\d))/g, " ")); // Period and space
    return formattedAmount;
  }

  updateLiveRegions(line, message) {
    const lineItemError = document.getElementById(`Line-item-error-${line}`) || document.getElementById(`CartDrawer-LineItemError-${line}`);
    if (lineItemError) lineItemError.querySelector(".cart-item__error-text").textContent = message;

    this.lineItemStatusElement.setAttribute("aria-hidden", true);

    const cartStatus = document.getElementById("cart-live-region-text") || document.getElementById("CartDrawer-LiveRegionText");
    cartStatus.setAttribute("aria-hidden", false);

    setTimeout(() => {
      cartStatus.setAttribute("aria-hidden", true);
    }, 1000);
  }

  getSectionInnerHTML(html, selector) {
    return new DOMParser().parseFromString(html, "text/html").querySelector(selector).innerHTML;
  }

  enableLoading(line) {
    const mainCartItems = document.getElementById("main-cart-items") || document.getElementById("CartDrawer-CartItems");
    mainCartItems.classList.add("cart__items--disabled");

    const cartItemElements = this.querySelectorAll(`#CartItem-${line} .loading__spinner`);
    const cartDrawerItemElements = this.querySelectorAll(`#CartDrawer-Item-${line} .loading__spinner`);

    [...cartItemElements, ...cartDrawerItemElements].forEach((overlay) => overlay.classList.remove("hidden"));

    document.activeElement.blur();
    this.lineItemStatusElement.setAttribute("aria-hidden", false);
  }

  disableLoading(line) {
    const mainCartItems = document.getElementById("main-cart-items") || document.getElementById("CartDrawer-CartItems");
    mainCartItems.classList.remove("cart__items--disabled");

    const cartItemElements = this.querySelectorAll(`#CartItem-${line} .loading__spinner`);
    const cartDrawerItemElements = this.querySelectorAll(`#CartDrawer-Item-${line} .loading__spinner`);

    cartItemElements.forEach((overlay) => overlay.classList.add("hidden"));
    cartDrawerItemElements.forEach((overlay) => overlay.classList.add("hidden"));
  }

  getConditionalAtcItemSettings() {
    const enableConditionalAtcItem = this.dataset.enableConditionalAtcItem === "true";
    const atcItemConditionType = this.dataset.atcItemConditionType || "";
    const atcItemMetaobjectHandle = this.dataset.atcItemMetaobjectHandle || "";
    const atcItemProductListCsv = this.dataset.atcItemProductList || "";
    const useAsExclusion = this.dataset.atcItemUseAsExclusion === "true";
    const atcItemThresholdValue = parseFloat(this.dataset.atcItemThresholdValue || "0");

    const parseCsv = (csv) => {
      return csv
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    };

    const atcItemVariantToAddCsv = this.dataset.atcItemVariantToAdd || "";
    const atcItemVariantToAdd = parseCsv(atcItemVariantToAddCsv);
    const atcItemProductList = parseCsv(atcItemProductListCsv);

    return {
      enableConditionalAtcItem,
      atcItemConditionType,
      atcItemMetaobjectHandle,
      atcItemProductList,
      useAsExclusion,
      atcItemVariantToAdd,
      atcItemThresholdValue,
    };
  }

  checkConditionalAtcOnInitialLoad() {
    fetch(`${routes.cart_url}.js`, { ...fetchConfig("json") })
      .then((resp) => resp.json())
      .then((cartData) => {
        const pseudoParsedState = {
          items: cartData.items,
        };
        this.handleConditionalAtcItem(pseudoParsedState);
      })
      .catch((err) => {});
  }

  handleConditionalAtcItem(parsedState) {
    if (this.isForcedCartUpdate) {
      return;
    }

    const { enableConditionalAtcItem, atcItemConditionType, atcItemProductList, useAsExclusion, atcItemVariantToAdd, atcItemThresholdValue } = this.getConditionalAtcItemSettings();

    if (!enableConditionalAtcItem) {
      return;
    }

    let relevantCount = 0;
    let relevantTotal = 0;

    parsedState.items.forEach((item) => {
      if (atcItemVariantToAdd.includes(String(item.variant_id))) {
        return;
      }
      const productIdStr = String(item.product_id);
      let productEligible;

      if (atcItemProductList.length === 0) {
        productEligible = true;
      } else if (useAsExclusion) {
        productEligible = !atcItemProductList.includes(productIdStr);
      } else {
        productEligible = atcItemProductList.includes(productIdStr);
      }

      if (!productEligible) return;

      if (atcItemConditionType === "cart_item_count") {
        relevantCount += item.quantity;
      } else if (atcItemConditionType === "cart_subtotal") {
        relevantTotal += item.original_line_price;
      } else if (atcItemConditionType === "cart_total") {
        relevantTotal += item.final_line_price;
      }
    });

    let conditionMet = false;
    if (atcItemConditionType === "cart_item_count") {
      conditionMet = relevantCount >= atcItemThresholdValue;
    } else {
      const requiredCents = atcItemThresholdValue * 100;
      conditionMet = relevantTotal >= requiredCents;
    }

    if (!conditionMet) {
      window.userRemovedAutoAtcItem = false;
      localStorage.removeItem("userRemovedAutoAtcItemData");
    }

    if (conditionMet && window.userRemovedAutoAtcItem) {
      return;
    }

    const singleVariantId = atcItemVariantToAdd[0];
    if (!singleVariantId) {
      return;
    }
    const lineIndex = this.findLineIndexByVariantId(parsedState.items, singleVariantId);
    if (conditionMet) {
      if (lineIndex === -1) {
        this.forceCartAdd(singleVariantId, 1);
      }
    } else {
      if (lineIndex !== -1) {
        this.forceCartRemove(lineIndex + 1);
      }
    }
  }

  findLineIndexByVariantId(items, variantId) {
    return items.findIndex((it) => String(it.variant_id) === String(variantId));
  }

  forceCartAdd(variantId, quantity) {
    this.isForcedCartUpdate = true;

    const body = JSON.stringify({
      items: [{ id: variantId, quantity }],
    });

    fetch(`${routes.cart_add_url}`, { ...fetchConfig("json"), ...{ body } })
      .then((response) => response.json())
      .then((jsonData) => {
        this.refreshCartAfterForcedUpdate();
      })
      .catch((err) => {
        this.isForcedCartUpdate = false;
      });
  }

  forceCartRemove(line) {
    this.isForcedCartUpdate = true;

    const body = JSON.stringify({
      line,
      quantity: 0,
    });

    fetch(`${routes.cart_change_url}`, { ...fetchConfig(), ...{ body } })
      .then((response) => response.text())
      .then((state) => {
        this.refreshCartAfterForcedUpdate();
      })
      .catch((err) => {
        this.isForcedCartUpdate = false;
      });
  }

  refreshCartAfterForcedUpdate() {
    const isDrawer = this.tagName === "CART-DRAWER-ITEMS";
    const sectionId = isDrawer ? "cart-drawer" : "main-cart-items";

    fetch(`${routes.cart_url}?section_id=${sectionId}`)
      .then((resp) => resp.text())
      .then((responseText) => {
        const html = new DOMParser().parseFromString(responseText, "text/html");

        if (isDrawer) {
          const newDrawerItems = html.querySelector("cart-drawer-items");
          const newDrawerFooter = html.querySelector(".cart-drawer__footer");
          const currentDrawerItems = document.querySelector("cart-drawer-items");
          const currentDrawerFooter = document.querySelector(".cart-drawer__footer");
          if (newDrawerItems && currentDrawerItems) {
            currentDrawerItems.replaceWith(newDrawerItems);
          }
          if (newDrawerFooter && currentDrawerFooter) {
            currentDrawerFooter.replaceWith(newDrawerFooter);
          }
        } else {
          const newCartItems = html.querySelector("cart-items");
          if (newCartItems) {
            this.innerHTML = newCartItems.innerHTML;
          }
        }
      })
      .catch((err) => {})
      .finally(() => {
        this.isForcedCartUpdate = false;
      });
  }
}

customElements.define("cart-items", CartItems);

if (!customElements.get("cart-note")) {
  customElements.define(
    "cart-note",
    class CartNote extends HTMLElement {
      constructor() {
        super();

        this.addEventListener(
          "input",
          debounce((event) => {
            const body = JSON.stringify({ note: event.target.value });
            fetch(`${routes.cart_update_url}`, { ...fetchConfig(), ...{ body } }).then(() => CartPerformance.measureFromEvent("note-update:user-action", event));
          }, ON_CHANGE_DEBOUNCE_TIMER)
        );
      }
    }
  );
}
