import React from 'react';
import { mount } from 'enzyme';
import * as StitchUtil from '../../src/utils/stitch';
import Banner from '../../src/components/Banner';
import { HeaderContext } from '../../src/components/header-context';
import { tick } from '../utils';

const mockBannerContent = {
  altText: 'Test',
  imgPath: '/banners/test.png',
  mobileImgPath: '/banners/test-mobile.png',
  url: 'https://mongodb.com',
};

describe('Banner component', () => {
  it('renders without a banner image', () => {
    // bannerContent state should remain null
    const wrapper = mount(<Banner />);
    expect(wrapper.find('Banner').children()).toHaveLength(0);
  });

  it('renders with a banner image', async () => {
    jest.useFakeTimers();
    jest.spyOn(StitchUtil, 'fetchBanner').mockImplementation(() => mockBannerContent);
    const setBannerContent = jest.fn();
    const wrapper = mount(
      <HeaderContext.Provider value={{ bannerContent: mockBannerContent, setBannerContent: setBannerContent }}>
        <Banner />
      </HeaderContext.Provider>
    );
    await tick({ wrapper });
    expect(wrapper).toMatchSnapshot();
  });
});