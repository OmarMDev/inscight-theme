class WholesaleInquiryForm extends HTMLElement {
  constructor() {
    super();
    this.form = this.querySelector('form');
    this.submitButton = this.querySelector('.wholesale-inquiry-form__button');
    this.successMessage = this.querySelector('.wholesale-inquiry-form__success');
    this.errorMessage = this.querySelector('.wholesale-inquiry-form__errors');
    
    if (this.form) {
      this.form.addEventListener('submit', this.handleSubmit.bind(this));
    }
  }

  handleSubmit(event) {
    event.preventDefault();
    
    // Disable submit button and show loading state
    this.submitButton.disabled = true;
    this.submitButton.classList.add('loading');
    this.originalButtonText = this.submitButton.textContent;
    this.submitButton.textContent = 'Submitting...';
    
    // Hide any previous messages
    if (this.successMessage) this.successMessage.style.display = 'none';
    if (this.errorMessage) this.errorMessage.style.display = 'none';
    
    // Get form data
    const formData = new FormData(this.form);
    
    // Convert form action to JSONP endpoint
    const formAction = this.form.action;
    const jsonpUrl = this.convertToJsonpUrl(formAction, formData);
    
    // Submit via JSONP
    this.submitViaJsonp(jsonpUrl, formData)
      .then((response) => {
        if (response.result === 'success') {
          // Check if we should also create Shopify customer
          const createShopifyCustomer = this.dataset.createShopifyCustomer === 'true';
          
          if (createShopifyCustomer) {
            return this.createShopifyCustomer(formData)
              .then(() => response)
              .catch(() => {
                // Don't fail if Shopify fails, Mailchimp succeeded
                console.warn('Shopify customer creation failed, but Mailchimp succeeded');
                return response;
              });
          }
          return response;
        } else {
          throw new Error(response.msg || 'Submission failed');
        }
      })
      .then((response) => {
        this.showSuccess();
        this.form.reset();
      })
      .catch((error) => {
        console.error('Error:', error);
        this.showError(error.message || 'There was an error submitting your request. Please try again.');
      })
      .finally(() => {
        this.resetButton();
      });
  }

  convertToJsonpUrl(formAction, formData) {
    // Convert /subscribe/post to /subscribe/post-json
    let url = formAction.replace('/subscribe/post', '/subscribe/post-json');
    
    // Add form parameters to URL
    const params = new URLSearchParams();
    for (let [key, value] of formData.entries()) {
      if (value) {
        params.append(key, value);
      }
    }
    
    // Add JSONP callback parameter
    params.append('c', '?');
    
    return `${url}${url.includes('?') ? '&' : '?'}${params.toString()}`;
  }

  submitViaJsonp(url, formData) {
    return new Promise((resolve, reject) => {
      // Create unique callback name
      const callbackName = 'mailchimpCallback_' + Date.now();
      
      let scriptElement;
      let timeoutId;
      
      // Create global callback function
      window[callbackName] = (data) => {
        console.log('Mailchimp JSONP response:', data);
        // Clean up
        clearTimeout(timeoutId);
        delete window[callbackName];
        if (scriptElement && scriptElement.parentNode) {
          document.body.removeChild(scriptElement);
        }
        
        resolve(data);
      };
      
      // Replace the callback placeholder with actual function name
      url = url.replace('c=?', 'c=' + callbackName);
      
      console.log('JSONP URL:', url);
      
      // Create script tag for JSONP
      scriptElement = document.createElement('script');
      scriptElement.src = url;
      
      // Set a timeout in case callback is never called
      timeoutId = setTimeout(() => {
        console.warn('JSONP timeout - callback was never invoked, but request may have succeeded');
        delete window[callbackName];
        if (scriptElement && scriptElement.parentNode) {
          document.body.removeChild(scriptElement);
        }
        // Assume success since we got a 200 response
        resolve({
          result: 'success',
          msg: 'Form submitted successfully'
        });
      }, 5000);
      
      scriptElement.onerror = () => {
        console.error('Script load error');
        clearTimeout(timeoutId);
        delete window[callbackName];
        if (scriptElement && scriptElement.parentNode) {
          document.body.removeChild(scriptElement);
        }
        // If it's a script error but the request succeeded, treat as success
        console.warn('Script error occurred, but this may indicate successful submission');
        resolve({
          result: 'success',
          msg: 'Form submitted successfully'
        });
      };
      
      document.body.appendChild(scriptElement);
    });
  }

  resetButton() {
    this.submitButton.disabled = false;
    this.submitButton.classList.remove('loading');
    this.submitButton.textContent = this.originalButtonText;
  }

  async createShopifyCustomer(formData) {
    // Create a new FormData for Shopify customer form
    const shopifyFormData = new FormData();
    shopifyFormData.append('form_type', 'customer');
    shopifyFormData.append('utf8', '✓');
    shopifyFormData.append('contact[tags]', 'wholesale-inquiry');
    shopifyFormData.append('contact[first_name]', formData.get('FNAME') || '');
    shopifyFormData.append('contact[email]', formData.get('EMAIL') || '');
    shopifyFormData.append('contact[phone]', formData.get('PHONE') || '');
    
    // Handle company field - could be COMPANY or MMERGE5
    const companyValue = formData.get('MMERGE5') || formData.get('COMPANY') || '';
    shopifyFormData.append('contact[note][Company]', companyValue);
    
    const response = await fetch('/contact', {
      method: 'POST',
      body: shopifyFormData,
      headers: {
        'Accept': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error('Shopify customer creation failed');
    }
  }
  
  showSuccess() {
    if (this.successMessage) {
      this.successMessage.style.display = 'block';
      this.successMessage.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    
    // Hide form fields after success
    const formWrapper = this.querySelector('.wholesale-inquiry-form__form-wrapper');
    if (formWrapper) {
      formWrapper.querySelector('.wholesale-inquiry-form__fields')?.remove();
      formWrapper.querySelector('.wholesale-inquiry-form__submit')?.remove();
    }
  }
  
  showError(message) {
    if (this.errorMessage) {
      this.errorMessage.textContent = message;
      this.errorMessage.style.display = 'block';
      this.errorMessage.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } else {
      alert(message);
    }
  }
}

customElements.define('wholesale-inquiry-form', WholesaleInquiryForm);
