(() => {
  'use strict';

  const placeholderPattern = /\/images\/placeholder\.jpg(?:$|[?#])/;

  const isPlaceholder = (image) => placeholderPattern.test(image.getAttribute('src') || '');

  const setWrapperState = (wrapper, image) => {
    wrapper.classList.toggle('upload-preview--empty', isPlaceholder(image));
  };

  const findExistingPreview = (input) => {
    const wrapper = input.closest('.img-preview-wrap') || input.closest('.img-row')?.querySelector('.img-thumb');
    const image = wrapper && wrapper.querySelector('img');

    return image ? { wrapper, image } : null;
  };

  const createPreview = (input) => {
    const preview = document.createElement('div');
    const image = document.createElement('img');

    preview.className = 'upload-preview';
    image.alt = 'Selected image preview';
    preview.appendChild(image);
    input.insertAdjacentElement('afterend', preview);

    return { wrapper: preview, image, isGenerated: true };
  };

  const resetPreview = (preview) => {
    if (preview.isGenerated) {
      preview.wrapper.classList.remove('is-visible');
      preview.image.removeAttribute('src');
      return;
    }

    if (preview.initialSource) {
      preview.image.setAttribute('src', preview.initialSource);
    } else {
      preview.image.removeAttribute('src');
    }

    setWrapperState(preview.wrapper, preview.image);
  };

  const showPreview = (preview, source) => {
    preview.image.src = source;

    if (preview.isGenerated) {
      preview.wrapper.classList.add('is-visible');
      return;
    }

    preview.wrapper.classList.remove('upload-preview--empty');
  };

  const initialiseInput = (input) => {
    let preview = findExistingPreview(input);

    if (preview) {
      preview.initialSource = preview.image.getAttribute('src') || '';
      setWrapperState(preview.wrapper, preview.image);
    } else {
      preview = createPreview(input);
    }

    input.addEventListener('change', () => {
      const file = input.files && input.files[0];

      if (!file || !file.type.startsWith('image/')) {
        resetPreview(preview);
        return;
      }

      if (!preview.isGenerated && !preview.image.src.startsWith('data:')) {
        preview.initialSource = preview.image.getAttribute('src') || '';
      }

      const reader = new FileReader();
      reader.addEventListener('load', () => showPreview(preview, reader.result), { once: true });
      reader.readAsDataURL(file);
    });

    if (input.form) {
      input.form.addEventListener('reset', () => {
        window.setTimeout(() => resetPreview(preview));
      });
    }
  };

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('input[type="file"][accept*="image"]').forEach(initialiseInput);

    const previewObserver = new MutationObserver((mutations) => {
      mutations.forEach(({ target }) => {
        const wrapper = target.closest('.img-preview-wrap, .img-thumb');
        if (wrapper) setWrapperState(wrapper, target);
      });
    });

    document.querySelectorAll('.img-preview-wrap img, .img-thumb img').forEach((image) => {
      previewObserver.observe(image, { attributes: true, attributeFilter: ['src'] });
    });
  });
})();
