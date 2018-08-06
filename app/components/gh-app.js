import { computed, observer } from '@ember/object';
import { inject } from '@ember/service';
import Component from '@ember/component';

import { sanitizeUrl } from '../utils/sanitize-url';
import setDockMenu from '../utils/set-dock-menu';
import setUsertasks from '../utils/set-user-tasks';
import setWindowTitle from '../utils/set-window-title';

const log = requireNode('electron-log');

export default Component.extend({
    store: inject(),
    autoUpdate: inject(),
    ipc: inject(),
    webviewShortcuts: inject(),
    classNameBindings: [ 'isMac:mac', 'isWindows:win', 'isNightShift:night-shift', ':gh-app' ],
    isFindInViewActive: false,
    isMac: !!(process.platform === 'darwin'),
    isWindows: !!(process.platform === 'win32'),
    isNightShift: false,

    /**
     * Called when the attributes passed into the component have been updated.
     * Called both during the initial render of a container and during a rerender.
     * Can be used in place of an observer; code placed here will be executed
     * every time any attribute updates.
     */
    didReceiveAttrs() {
        this.setup();
        this.get('autoUpdate').checkForUpdates();
    },

    /**
     * Called when the element of the view has been inserted into the DOM.
     */
    didInsertElement() {
        const ipc = this.get('ipc');

        ipc.notifyReady();
        ipc.on('night-shift', (status) => this.handleNightShift(status));
        ipc.on('open-blog', (details) => this.handleOpenBlogEvent(details));
        ipc.on('create-draft', (details) => this.handleCreateDraftEvent(details));
    },

    /**
     * Open a blog. If it doesn't exist yet, open the "add blog" UI.
     *
     * @param {Object} details
     * @property {string} user - Email address of the user (for prefill)
     * @property {string} url - Url of the blog
     */
    handleOpenBlogEvent({ url, user } = { url: '', user: '' }) {
        const sanitizedUrl = sanitizeUrl(url);
        const blogs = this.get('blogs');
        const matchedBlog = blogs ? blogs.find((b) => b.get('url') === sanitizedUrl) : null;

        if (matchedBlog) {
            this.send('switchToBlog', matchedBlog);
        } else {
            this.send('showAddBlog', { url: sanitizedUrl, user });
        }
    },

    /**
     * Handles the "create a draft" event
     *
     * @param {string} [{title, content}={title: '', content: ''}]
     */
    handleCreateDraftEvent({ title, content } = { title: '', content: '' }) {
        this.get('webviewShortcuts').openNewPost(true, { title, content });
    },

    /**
     * Toggles the night shift setting
     *
     * @param {boolean} [status=false]
     */
    handleNightShift(status = false) {
        this.set('isNightShift', status);
    },

    /**
     * Boolean value that returns true if there are any blogs
     */
    hasBlogs: computed('blogs', function () {
        const b = this.get('blogs');
        return !!(b && b.length > 0);
    }),

    blogsObserver: observer('blogs', 'hasBlogs', function () {
        if (!this.get('hasBlogs')) this.send('showAddBlog');
    }),

    titleObserver: observer('title', function () {
        setWindowTitle(this.get('title'));
    }),

    /**
     * Setup method, determining which blog to display.
     */
    setup() {
        if (this.get('hasBlogs')) {
            log.silly(`gh-app: Found blogs, opening first one.`);
            this.send('switchToBlog', this.findSelectedBlog() || this.get('blogs.firstObject'));
            this.createMenus();
        } else {
            log.silly(`gh-app: Didn't find a blog, setting "edit blog" to visible.`);
            this.set('selectedBlog', null);
            this.set('isEditBlogVisible', true);
        }
    },

    /**
     * Gets the current blogs and creates the various menus.
     * On Windows: User Tasks (taskbar)
     * On OS X: Dock Menu
     * On all: Window Menu
     */
    createMenus() {
        log.silly(`gh-app: Creating menus`);
        const blogs = this.get('blogs');
        const menu = [];

        blogs.forEach((blog) => {
            menu.push({
                name: blog.get('name'),
                callback: () => this.send('switchToBlog', blog)
            });
        });

        if (process.platform === 'darwin') setDockMenu(menu);
        if (process.platform === 'win32') setUsertasks(menu);
    },

    /**
     * Finds the first blog marked as "selected"
     *
     * @returns {Object|null} blog
     */
    findSelectedBlog() {
        if (!this.get('hasBlogs')) return null;

        return this.get('blogs').find((blog) =>  blog.get('isSelected'));
    },

    /**
     * Reloads the blogs from the local database
     */
    refreshBlogs() {
        log.silly(`gh-app: Refreshing blogs.`);
        return this.get('store').findAll('blog')
            .then((result) => {
                this.set('blogs', result);
                this.setup();
            });
    },

    /**
     * Sets the visibility of the preferences ui, the edit blog ui,
     * and the blogs.
     *
     * @param {Object}   [options={}] - Options object
     * @param {boolean}  [options.showBlog=true] - "Edit Blog" UI
     * @param {boolean}  [options.showPreferences=false] - "Preferences" UI
     * @param {DS.Model} [options.blog] - Blog to display
     */
    setScreenVisibility({ showAddBlog = true, showPreferences = false, blog = null }) {
        const selectedBlog = this.get('selectedBlog');

        if ((!blog && selectedBlog) || (selectedBlog && blog && selectedBlog !== blog)) {
            selectedBlog.unselect();
        }

        if (blog) {
            blog.select();
            this.set('title', `Ghost - ${blog.get('name')}`);
            this.set('selectedBlog', blog);
        }

        this.setProperties({
            isPreferencesVisible: showPreferences,
            isEditBlogVisible: showAddBlog
        });
    },

    /**
     * Displays the "add blog" UI
     */
    showEditBlogUI() {
        this.setScreenVisibility({
            showAddBlog: true,
            showPreferences: false
        });
    },

    /**
     * Displays the "preferences" UI
     */
    showPreferencesUI() {
        this.setScreenVisibility({
            showAddBlog: false,
            showPreferences: true
        });
    },

    actions: {
        /**
         * Switches to a given blog
         *
         * @param {Object} blog - Blog to switch to
         */
        switchToBlog(blog) {
            if (blog) {
                this.setScreenVisibility({
                    showAddBlog: false,
                    showPreferences: false,
                    blog
                });
            }
        },

        /**
         * Clears the "blogToEdit" property, turning the
         * edit blog UI into an "add blog" UI
         */
        showAddBlog(preFillValues) {
            this.set('blogToEdit', undefined);
            this.set('preFillValues', preFillValues);
            this.showEditBlogUI();
        },

        /**
         * Sets the blogToEdit property to a given blog
         *
         * @param blog - Blog to edit
         */
        showEditBlog(blog, editWarning) {
            this.set('blogToEdit', blog);
            this.set('editWarning', editWarning);
            this.set('preFillValues', null);
            this.showEditBlogUI();
        },

        /**
         * Shows the preferences
         */
        showPreferences() {
            this.showPreferencesUI();
        },

        /**
         * Handles an added blog
         *
         * @param {Object} blog - Added blog
         */
        blogAdded(blog) {
            this.refreshBlogs()
                .then(() => {
                    this.send('switchToBlog', blog);
                })
        },

        /**
         * Handles the removal of a blog
         */
        blogRemoved() {
            this.refreshBlogs();
        }
    }
});
