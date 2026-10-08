const $ = selector => document.querySelector(selector);

let lang = 'uz';

try {
  lang = localStorage.getItem('faunadata-language') || 'uz';
} catch {}

if (!translations[lang]) lang = 'uz';

const t = key => translations[lang][key] || key;

const localize = value =>
  value && typeof value === 'object'
    ? value[lang] || value.en
    : value;

let data = null;
let map = null;
let selected = null;
let imageURL = null;
let fileGeneration = 0;
let loadFailed = false;
let uploadErrorKey = null;

const markers = new Map();

const countryBounds = [
  [37.1, 55.9],
  [45.7, 73.2]
];

function element(tag, text, className) {
  const node = document.createElement(tag);

  if (text !== undefined) {
    node.textContent = text;
  }

  if (className) {
    node.className = className;
  }

  return node;
}

function color(location) {
  const count = location.populationRange?.max;

  if (count == null) return '#758b94';
  if (count <= 15) return '#efcd42';
  if (count <= 30) return '#e98c32';

  return '#9d342d';
}

function translate() {
  document.documentElement.lang = lang;
  document.title = 'FAUNADATA INTERNATIONAL · UFDI';

  document.querySelectorAll('[data-t]').forEach(node => {
    node.textContent = t(node.dataset.t);
  });

  document.querySelectorAll('[data-lang]').forEach(button => {
    const active = button.dataset.lang === lang;

    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });

  $('#preview-image').alt = t('yourPhoto');

  $('#map').setAttribute(
    'aria-label',
    t('distribution')
  );

  $('#project-fields').replaceChildren(
    ...translations[lang].fields.map(text =>
      element('li', text)
    )
  );

  if (data) renderRecords();
  if (selected) showDetail(selected);

  if (loadFailed) {
    $('#load-error').textContent = t('loadError');
  }

  if (uploadErrorKey) {
    $('#upload-error').textContent = t(uploadErrorKey);
  }

  window.renderRecognition?.();
}

function addDetail(list, label, value) {
  const displayedValue =
    value == null || value === ''
      ? t('unknown')
      : value;

  list.append(
    element('dt', label),
    element('dd', displayedValue)
  );
}

function showDetail(location) {
  selected = location;

  const list = element('dl');

  addDetail(
    list,
    t('coordinates'),
    `${location.latitude}, ${location.longitude}`
  );

  addDetail(
    list,
    t('population'),
    location.population
  );

  addDetail(
    list,
    t('survey'),
    location.surveyDate
  );

  addDetail(
    list,
    t('scope'),
    localize(location.estimateScope)
  );

  addDetail(
    list,
    t('method'),
    localize(location.method)
  );

  const heading = element(
    'h3',
    localize(location.name)
  );

  const note = element(
    'p',
    t('countScopeNote'),
    'secondary'
  );

  $('#detail').replaceChildren(
    heading,
    list,
    note
  );

  if (location.evidenceUrl) {
    const link = element(
      'a',
      t('source') + ' ↗'
    );

    link.href = location.evidenceUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';

    $('#detail').append(link);
  }

  document.querySelectorAll('[data-location]').forEach(button => {
    const active = button.dataset.location === location.id;

    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });

  markers.forEach((marker, id) => {
    marker.setStyle({
      weight: id === location.id ? 3 : 1.5
    });
  });
}

function selectLocation(location) {
  showDetail(location);

  map?.flyTo(
    [location.latitude, location.longitude],
    8
  );
}

function renderRecords() {
  $('#locations').replaceChildren(
    ...data.locations.map(location => {
      const button = element(
        'button',
        localize(location.name),
        'location'
      );

      button.dataset.location = location.id;

      button.append(
        element(
          'small',
          location.population == null
            ? t('unknownBin')
            : location.population
        )
      );

      button.addEventListener('click', () => {
        selectLocation(location);
      });

      return button;
    })
  );

  $('#planned-species').replaceChildren(
    ...data.plannedSpecies.map(species => {
      const item = element('li');

      item.append(
        element('strong', localize(species.names)),
        element('em', species.scientificName)
      );

      return item;
    })
  );

  $('#population-evidence').replaceChildren(
    ...data.regionalEstimates.map(estimate => {
      const card = element(
        'article',
        undefined,
        'evidence'
      );

      card.append(
        element('h3', localize(estimate.name)),

        element(
          'strong',
          `${estimate.min}–${estimate.max}`,
          'population-number'
        ),

        element('p', localize(estimate.period)),

        element(
          'p',
          localize(estimate.method),
          'secondary'
        )
      );

      return card;
    })
  );

  $('#biology-record').replaceChildren(
    ...data.biologicalRecord.map(record => {
      const card = element('article');

      card.append(
        element('h3', localize(record.label)),
        element('p', localize(record.value))
      );

      return card;
    })
  );
}

function createMap() {
  if (map || !data) return;

  if (!window.L) {
    $('#map').hidden = true;
    $('#map-warning').hidden = false;
    $('#map-warning').dataset.t = 'mapUnavailable';
    $('#map-warning').textContent = t('mapUnavailable');

    return;
  }

  map = L.map('map', {
    scrollWheelZoom: false
  }).fitBounds(countryBounds);

  L.tileLayer(
    'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    {
      maxZoom: 18,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }
  )
    .on('tileerror', () => {
      $('#map-warning').hidden = false;
    })
    .addTo(map);

  data.locations.forEach(location => {
    if (
      !Number.isFinite(location.latitude) ||
      !Number.isFinite(location.longitude)
    ) {
      return;
    }

    const marker = L.circleMarker(
      [location.latitude, location.longitude],
      {
        radius: 11,
        color: '#183b35',
        weight: 1.5,
        fillColor: color(location),
        fillOpacity: 0.9
      }
    ).addTo(map);

    marker.on('click', () => {
      selectLocation(location);
    });

    markers.set(location.id, marker);
  });

  showDetail(selected || data.locations[0]);
}

function route() {
  const showSpecies =
    location.hash === '#/species/panthera-uncia';

  $('#start-view').hidden = showSpecies;
  $('#species-view').hidden = !showSpecies;
  $('#species-content').hidden = !data;
  $('#load-error').hidden = !loadFailed;

  if (showSpecies && data) {
    createMap();

    requestAnimationFrame(() => {
      map?.invalidateSize();
    });
  }
}

function uploadError(key) {
  uploadErrorKey = key;

  $('#upload-error').textContent = t(key);
  $('#upload-error').hidden = false;
}

async function acceptFile(file) {
  if (!file) return;

  const job = ++fileGeneration;

  window.cancelRecognition?.();

  $('#review').hidden = true;
  $('#uncertain-message').hidden = true;
  $('#upload-error').hidden = true;

  uploadErrorKey = null;

  if (imageURL) {
    URL.revokeObjectURL(imageURL);
  }

  imageURL = null;

  if (!file.type.startsWith('image/')) {
    return uploadError('invalidFile');
  }

  if (file.size > 12 * 1024 * 1024) {
    return uploadError('tooLarge');
  }

  const url = URL.createObjectURL(file);
  const image = new Image();

  image.src = url;

  try {
    await image.decode();

    if (job !== fileGeneration) {
      URL.revokeObjectURL(url);
      return;
    }

    imageURL = url;

    $('#preview-image').src = url;
    $('#review').hidden = false;

    window.identifyAnimal?.(image);
  } catch {
    URL.revokeObjectURL(url);

    if (job === fileGeneration) {
      uploadError('decodeError');
    }
  }
}

$('#animal-image').addEventListener('change', event => {
  acceptFile(event.target.files[0]);

  // Allows choosing the same file again.
  event.target.value = '';
});

$('#drop-zone').addEventListener('keydown', event => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    $('#animal-image').click();
  }
});

['dragenter', 'dragover'].forEach(type => {
  $('#drop-zone').addEventListener(type, event => {
    event.preventDefault();
    $('#drop-zone').classList.add('dragging');
  });
});

['dragleave', 'drop'].forEach(type => {
  $('#drop-zone').addEventListener(type, event => {
    event.preventDefault();
    $('#drop-zone').classList.remove('dragging');

    if (type === 'drop') {
      acceptFile(event.dataTransfer.files[0]);
    }
  });
});

$('#confirm').addEventListener('click', () => {
  if (imageURL) {
    location.hash = '/species/panthera-uncia';
    window.scrollTo(0, 0);
  }
});

$('#uncertain').addEventListener('click', () => {
  $('#uncertain-message').hidden = false;
});

$('#reset').addEventListener('click', () => {
  map?.fitBounds(countryBounds);
});

$('#download').addEventListener('click', () => {
  if (!data) return;

  const url = URL.createObjectURL(
    new Blob(
      [JSON.stringify(data, null, 2)],
      { type: 'application/json' }
    )
  );

  const link = element('a');

  link.href = url;
  link.download = 'panthera-uncia.json';

  document.body.append(link);

  link.click();
  link.remove();

  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
});

document.querySelectorAll('[data-lang]').forEach(button => {
  button.addEventListener('click', () => {
    lang = button.dataset.lang;

    try {
      localStorage.setItem('faunadata-language', lang);
    } catch {}

    translate();
  });
});

window.addEventListener('hashchange', route);

window.addEventListener('pagehide', () => {
  if (imageURL) {
    URL.revokeObjectURL(imageURL);
  }
});

translate();
route();

fetch('data.json')
  .then(response => {
    if (!response.ok) {
      throw Error('data');
    }

    return response.json();
  })
  .then(record => {
    if (
      record.id !== 'panthera-uncia' ||
      !Array.isArray(record.locations) ||
      !record.locations.length
    ) {
      throw Error('data');
    }

    data = record;

    renderRecords();

    selected = data.locations[0];

    showDetail(selected);
    route();
  })
  .catch(() => {
    loadFailed = true;

    $('#load-error').textContent = t('loadError');

    uploadError('loadError');
    route();
  });