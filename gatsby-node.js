const path = require('path');
const { transformBreadcrumbs } = require('./src/utils/setup/transform-breadcrumbs.js');
const { initStitch } = require('./src/utils/setup/init-stitch');
const { saveAssetFiles, saveStaticFiles } = require('./src/utils/setup/save-asset-files');
const { validateEnvVariables } = require('./src/utils/setup/validate-env-variables');
const { getNestedValue } = require('./src/utils/get-nested-value');
const { getGuideMetadata } = require('./src/utils/get-guide-metadata');
const { getPageSlug } = require('./src/utils/get-page-slug');
const { siteMetadata } = require('./src/utils/site-metadata');
const { assertTrailingSlash } = require('./src/utils/assert-trailing-slash');
const { DOCUMENTS_COLLECTION, METADATA_COLLECTION } = require('./src/build-constants');
const { constructPageIdPrefix } = require('./src/utils/setup/construct-page-id-prefix');
const { constructBuildFilter } = require('./src/utils/setup/construct-build-filter');

const DB = siteMetadata.database;

const buildFilter = constructBuildFilter(siteMetadata);

// different types of references
const PAGES = [];
const GUIDES_METADATA = {};

// in-memory object with key/value = filename/document
let RESOLVED_REF_DOC_MAPPING = {};

// stich client connection
let stitchClient;

const assets = new Map();

exports.sourceNodes = async ({ actions, createContentDigest, createNodeId }) => {
  const { createNode } = actions;

  // setup env variables
  const envResults = validateEnvVariables();

  if (envResults.error) {
    throw Error(envResults.message);
  }

  // wait to connect to stitch
  stitchClient = await initStitch();

  const documents = await stitchClient.callFunction('fetchDocuments', [DB, DOCUMENTS_COLLECTION, buildFilter]);

  if (documents.length === 0) {
    console.error('No documents matched your query.');
    process.exit(1);
  }

  const pageIdPrefix = constructPageIdPrefix(siteMetadata);
  documents.forEach((doc) => {
    const { page_id, ...rest } = doc;
    RESOLVED_REF_DOC_MAPPING[page_id.replace(`${pageIdPrefix}/`, '')] = rest;
  });

  // Identify page documents and parse each document for images
  Object.entries(RESOLVED_REF_DOC_MAPPING).forEach(([key, val]) => {
    const pageNode = getNestedValue(['ast', 'children'], val);
    const filename = getNestedValue(['filename'], val) || '';
    if (pageNode) {
      val.static_assets.forEach((asset) => {
        const checksum = asset.checksum;
        if (assets.has(checksum)) {
          assets.set(checksum, new Set([...assets.get(checksum), asset.key]));
        } else {
          assets.set(checksum, new Set([asset.key]));
        }
      });
    }

    if (filename.endsWith('.txt')) {
      PAGES.push(key);
      if (process.env.GATSBY_SITE === 'guides') {
        GUIDES_METADATA[key] = getGuideMetadata(val);
      }
    }
  });

  // Get all MongoDB products for the sidenav
  const products = await stitchClient.callFunction('fetchAllProducts', [siteMetadata.database]);
  products.forEach((product) => {
    createNode({
      children: [],
      id: createNodeId(`Product-${product.title}`),
      internal: {
        contentDigest: createContentDigest(product),
        type: 'Product',
      },
      parent: null,
      title: product.title,
      url: product.baseUrl + product.slug,
    });
  });
};

exports.createPages = async ({ actions }) => {
  const { createPage } = actions;
  const [, { static_files: staticFiles, ...metadataMinusStatic }] = await Promise.all([
    saveAssetFiles(assets, stitchClient),
    stitchClient.callFunction('fetchDocument', [DB, METADATA_COLLECTION, buildFilter]),
  ]);

  const { parentPaths, slugToTitle } = metadataMinusStatic;
  if (parentPaths) {
    transformBreadcrumbs(parentPaths, slugToTitle);
  }

  // Save files in the static_files field of metadata document, including intersphinx inventories
  if (staticFiles) {
    await saveStaticFiles(staticFiles);
  }

  return new Promise((resolve, reject) => {
    PAGES.forEach((page) => {
      const pageNodes = RESOLVED_REF_DOC_MAPPING[page]?.ast;

      const slug = getPageSlug(page);
      if (RESOLVED_REF_DOC_MAPPING[page] && Object.keys(RESOLVED_REF_DOC_MAPPING[page]).length > 0) {
        createPage({
          path: assertTrailingSlash(slug),
          component: path.resolve(__dirname, './src/components/DocumentBody.js'),
          context: {
            slug,
            metadata: metadataMinusStatic,
            template: pageNodes?.options?.template,
            page: pageNodes,
            guidesMetadata: GUIDES_METADATA,
          },
        });
      }
    });

    resolve();
  });
};

// Prevent errors when running gatsby build caused by browser packages run in a node environment.
exports.onCreateWebpackConfig = ({ stage, loaders, actions }) => {
  if (stage === 'build-html') {
    actions.setWebpackConfig({
      module: {
        rules: [
          {
            test: /mongodb-stitch-browser-sdk/,
            use: loaders.null(),
          },
        ],
      },
    });
  }
};

// Remove type inference, as our schema is too ambiguous for this to be useful.
// https://www.gatsbyjs.com/docs/scaling-issues/#switch-off-type-inference-for-sitepagecontext
exports.createSchemaCustomization = ({ actions }) => {
  actions.createTypes(`
    type SitePage implements Node @dontInfer {
      path: String!
    }
  `);
};
