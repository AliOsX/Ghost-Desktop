import DS from 'ember-data';
import getIconColor from '../utils/color-picker';
import requireKeytar from '../utils/require-keytar';
import getBlogName from '../utils/get-blog-name';

const { Model, attr } = DS;
const log = requireNode('electron-log');

export default Model.extend({
    index: attr('number', {
        defaultValue: 0
    }),
    name: attr('string'),
    url: attr('string'),
    identification: attr('string'),
    isSelected: attr('boolean'),
    iconColor: attr('string', {
        defaultValue: () => getIconColor(null)
    }),
    basicUsername: attr('string'),
    basicPassword: attr('string'),
    isResetRequested: attr('boolean'),

    /**
     * Convenience method, marking the blog as selected (and saving)
     */
    select() {
        if (this.isDestroying || this.isDestroyed || this.get('isDeleted')) {
            return;
        }

        log.verbose(`Blog model: Selected ${this.url}`);
        this.set('isSelected', true);
        this.save();
    },

    /**
     * Convenience method, marking the blog as unselected (and saving)
     */
    unselect() {
        if (this.isDestroying || this.isDestroyed || this.get('isDeleted')) {
            return;
        }

        log.verbose(`Blog model: Unselecting ${this.url}`);
        this.set('isSelected', false);
        this.save();
    },

    /**
     * Convenience method, generates a nice icon color for this blog.
     */
    randomIconColor(excluding = null) {
        const newColor = getIconColor(excluding);

        log.verbose(`Blog model: Creating new color ${this.url}`);

        if (newColor === this.get('iconColor')) {
            return this.randomIconColor(excluding);
        } else {
            this.set('iconColor', newColor);
        }
    },

    /**
     * Uses the operating system's native credential store to set the password
     * for this blog.
     *
     * @param {string} value - Password to set
     * @return {Promise<void>} - Success
     */
    async setPassword(value) {
        const keytar = requireKeytar();

        log.verbose(`Blog model: Updating password ${this.url}`);
        log.verbose(`Blog model: Keytar present: ${!!keytar}`);

        if (keytar) {
            try {
                await keytar.setPassword(this.get('url'), this.get('identification'), value);
            } catch (error) {
                log.verbose(`Blog model: Unable to store password. Error: ${error}`);
            }
        }
    },

    /**
     * Uses the operating system's native credential store to get the password
     * for this blog.
     *
     * @return {Promise<string>} Password for this blog
     */
    async getPassword() {
        if (!this.get('url') || !this.get('identification')) {
            return null;
        }

        const keytar = requireKeytar();

        log.verbose(`Blog model: Getting password ${this.url}`);
        log.verbose(`Blog model: Keytar present: ${!!keytar}`);

        if (keytar) {
            try {
                return keytar.getPassword(this.get('url'), this.get('identification'));
            } catch (error) {
                log.verbose(`Blog model: Unable to retrieve password. Error: ${error}`);
            }
        }

        return null;
    },

    /**
     * Updates this blog's name by attempting to fetch the blog homepage
     * and extracting the name
     */
    updateName() {
        const url = this.get('url');

        log.verbose(`Blog model: Updating name ${this.url}`);

        if (url) {
            return getBlogName(url)
                .then((name) => {
                    log.verbose(`Blog model: Name found ${this.url}`);
                    this.set('name', name);
                })
                .catch((e) => {
                    log.info(`Blog model: Tried to update blog name, but failed: ${e}`);
                });
        }
    },

    /**
     * Delete the password while deleting the blog.
     * Todo: DeleteRecord isn't persisted, meaning that if we ever
     * call this and then pretend that we never meant to delete stuff,
     * the password will still be gone.
     */
    deleteRecord() {
        this._super();

        const keytar = requireKeytar();

        log.verbose(`Blog model: Deleting record`);
        log.verbose(`Blog model: Keytar present: ${!!keytar}`);

        return (keytar
            ? keytar.deletePassword(this.get('url'), this.get('identification'))
            : null);
    },

    /**
     * Whenever a blog is updated, we also inform the main thread
     * - just to ensure that the thread there knows about blogs
     * too.
     */
    save() {
        const { ipcRenderer } = requireNode('electron');
        const serializedData = this.toJSON({ includeId: true });

        log.verbose(`Blog model: Saving record`);

        ipcRenderer.send('blog-serialized', serializedData);
        return this._super(...arguments);
    }
});
