import { mount } from 'svelte';
import StudioPage from './StudioPage.svelte';
import './style.css';

const target = document.getElementById('app');
if (!target) throw new Error('#app element missing');

export default mount(StudioPage, { target });
