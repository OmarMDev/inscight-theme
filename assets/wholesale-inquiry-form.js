class WholesaleInquiryForm extends HTMLElement {
  constructor() {
    super();
    this.form = this.querySelector('form');
    this.submitButton = this.querySelector('.wholesale-inquiry-form__button');
    this.successMessage = this.querySelector('.wholesale-inquiry-form__success');
    this.errorMessage = this.querySelector('.wholesale-inquiry-form__errors');
    this.iframe = null;
    
    if (this.form) {
      this.setupIframeSubmission();
      this.form.addEventListener('submit', this.handleSubmit.bind(this));
    }
  }

  setupIframeSubmission() {
    // Create hidden iframe for form submission
    this.iframe = document.createElement('iframe');
    this.iframe.name = 'mailchimp-submit-frame';
    this.iframe.style.display = 'none';
    document.body.appendChild(this.iframe);
    
    // Set form target to iframe
    this.form.setAttribute('target', 'mailchimp-submit-frame');
    
    // Listen for iframe load to detect submission result
    this.iframe.addEventListener('load', () => {
      if (this.isSubmitting) {
        this.handleMailchimpResponse();
      }
    });
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
    
    // Mark that we're submitting
    this.isSubmitting = true;
    
    // Store form data for potential Shopify customer creation
    this.formData = new FormData(this.form);
    
    // Submit the form (will go to iframe)
    this.form.submit();
  }

  handleMailchimpResponse() {
    this.isSubmitting = false;
    
    try {
      // Try to read iframe content to check for success/error
      const iframeDoc = this.iframe.contentDocument || this.iframe.contentWindow.document;
      const iframeBody = iframeDoc.body;
      
      if (iframeBody) {
        const bodyText = iframeBody.innerText || iframeBody.textContent || '';
        
        // Check for Mailchimp error messages
        if (bodyText.toLowerCase().includes('already subscribed') ||
            bodyText.toLowerCase().includes('too many') ||
            bodyText.toLowerCase().includes('invalid') ||
            bodyText.toLowerCase().includes('error')) {
          this.showError('There was an issue with your submission. Please check your information and try again.');
          this.resetButton();
          return;
        }
      }
    } catch (e) {
      // Cross-origin iframe - can't read content, assume success
      console.log('Cannot read iframe content (cross-origin), assuming success');
    }
    
    // Check if we should also create Shopify customer
    const createShopifyCustomer = this.dataset.createShopifyCustomer === 'true';
    
    if (createShopifyCustomer) {
      this.createShopifyCustomer(this.formData)
        .then(() => {
          this.showSuccess();
          this.form.reset();
          this.resetButton();
        })
        .catch(() => {
          // Still show success for Mailchimp, just log Shopify error
          console.warn('Shopify customer creation failed, but Mailchimp submission succeeded');
          this.showSuccess();
          this.form.reset();
          this.resetButton();
        });
    } else {
      this.showSuccess();
      this.form.reset();
      this.resetButton();
    }
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
