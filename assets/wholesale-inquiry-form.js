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
    const originalButtonText = this.submitButton.textContent;
    this.submitButton.textContent = 'Submitting...';
    
    // Hide any previous messages
    if (this.successMessage) this.successMessage.style.display = 'none';
    if (this.errorMessage) this.errorMessage.style.display = 'none';
    
    const formData = new FormData(this.form);
    
    // Submit to Mailchimp
    fetch(this.form.action, {
      method: 'POST',
      body: formData,
      mode: 'no-cors' // Mailchimp doesn't support CORS, so we use no-cors mode
    })
    .then(() => {
      // With no-cors mode, we can't read the response, so we assume success
      // Mailchimp will send the welcome email if configured
      
      // Check if we should also create Shopify customer
      const createShopifyCustomer = this.dataset.createShopifyCustomer === 'true';
      
      if (createShopifyCustomer) {
        return this.createShopifyCustomer(formData);
      } else {
        return Promise.resolve();
      }
    })
    .then(() => {
      // Show success message
      this.showSuccess();
      this.form.reset();
    })
    .catch((error) => {
      console.error('Error:', error);
      this.showError('There was an error submitting your request. Please try again.');
    })
    .finally(() => {
      // Re-enable submit button
      this.submitButton.disabled = false;
      this.submitButton.classList.remove('loading');
      this.submitButton.textContent = originalButtonText;
    });
  }
  
  async createShopifyCustomer(mailchimpFormData) {
    // Create a new FormData for Shopify customer form
    const shopifyFormData = new FormData();
    shopifyFormData.append('form_type', 'customer');
    shopifyFormData.append('utf8', '✓');
    shopifyFormData.append('contact[tags]', 'wholesale-inquiry');
    shopifyFormData.append('contact[first_name]', mailchimpFormData.get('FNAME') || '');
    shopifyFormData.append('contact[email]', mailchimpFormData.get('EMAIL') || '');
    shopifyFormData.append('contact[phone]', mailchimpFormData.get('PHONE') || '');
    shopifyFormData.append('contact[note][Company]', mailchimpFormData.get('COMPANY') || '');
    
    try {
      const response = await fetch('/contact', {
        method: 'POST',
        body: shopifyFormData,
        headers: {
          'Accept': 'application/json'
        }
      });
      
      if (!response.ok) {
        console.warn('Shopify customer creation failed, but Mailchimp submission succeeded');
      }
    } catch (error) {
      console.warn('Shopify customer creation error:', error);
      // Don't throw - we don't want to show error if Mailchimp succeeded
    }
  }
  
  showSuccess() {
    if (this.successMessage) {
      this.successMessage.style.display = 'block';
      this.successMessage.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    
    // Hide form fields after success (optional)
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
