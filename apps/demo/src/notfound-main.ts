import { mount } from 'svelte';
import NotFoundPage from './NotFoundPage.svelte';
import './style.css';

const target = document.getElementById('app');
if (!target) throw new Error('#app element missing');

export default mount(NotFoundPage, { target });
