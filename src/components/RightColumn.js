import React from 'react';
import PropTypes from 'prop-types';
import { css } from '@emotion/core';
import { displayNone } from '../utils/display-none';
import { theme } from '../theme/docsTheme';

const RightColumn = ({ children, className }) => (
  <div
    className={className}
    css={css`
      margin: 70px 24px 40px 54px;
      min-width: 180px;

      ${displayNone.onMobileAndTablet};
    `}
  >
    {/* top: 99px allows a top margin of 12px from Consistent Nav for first element in column*/}
    <div
      css={css`
        height: 100%;
        max-height: calc(100vh - 120px);
        overflow: auto;
        position: sticky;
        top: ${theme.size.medium};

        & > * {
          margin-bottom: 30px;
          margin-right: 24px;
        }
      `}
    >
      {children}
    </div>
  </div>
);

RightColumn.propTypes = {
  children: PropTypes.oneOfType([PropTypes.arrayOf(PropTypes.node), PropTypes.node]).isRequired,
};

export default RightColumn;
