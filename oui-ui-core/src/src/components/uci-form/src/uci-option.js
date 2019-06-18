import validator from './validator'

export default {
  name: 'UciOption',
  inject: ['uciForm', 'uciSection'],
  props: {
    type: {
      required: true,
      validator: value => {
        return ['input', 'dummy', 'list', 'dlist', 'switch'].indexOf(value) !== -1;
      }
    },
    label: String,
    name: {
      type: String,
      required: true
    },
    description: String,
    required: Boolean,
    /* If load from uci fails, the value of the property is used as the form value. */
    initial: [Number, String, Array],
    /* If this prop is provided, the uci value will be accessed with this prop instead of the name prop. */
    uciOption: String,
    /* Used for switch */
    activeValue: {
      type: String,
      default: '1'
    },
    inactiveValue: {
      type: String,
      default: '0'
    },
    /* Used for list */
    options: {
      type: Array,
      default() {
        return [];
      }
    },
    /*
    ** If a function provided, the form loads the value by the function instead of from uci.
    ** If other type provided, the form loads the value from the prop's value.
    */
    load: [String, Array, Function],
    /*
    ** If a function provided, it will be called when oui saves the uci configuration.
    ** If an any string provided, indicates don't save uci.
    */
    save: [String, Function],
    /* If this function is provided, it will be called when oui applys the uci configuration. */
    apply: Function,
    /* depend="(a == 12 || a == 'x') && y == 4 && q != 5 && !z" */
    depend: {
      type: String,
      default: ''
    },
    placeholder: String,
    /* Used for multiple list */
    multiple: Boolean,
    /* validator rules */
    rules: [String, Object, Function, Array],
    /* Used for list */
    allowCreate: Boolean,
    password: Boolean,
    tab: String,
    /* Used for custom header of table column */
    header: String
  },
  data() {
    return {
      /* original value */
      original: null,
      uid: -1
    }
  },
  computed: {
    tabName() {
      if (this.tab)
        return this.tab;
      let parent = this.$getParent('UciTab');
      if (parent)
        return parent.name;
      return undefined;
    },
    config() {
      return this.uciForm.config;
    },
    form() {
      return this.uciForm.form;
    },
    parsedDepend() {
      const compares = ['==', '===', '!=', '!==', '<', '>', '>=', '<='];
      const expr = this.depend.trim().replace(/\s+/g, ' ');
      const states = {
        name: 0,
        operand: 1,
        logic: 2,
        logicOrCmp: 3
      }

      if (expr === '')
        return undefined;

      const parts = expr.split(' ');

      let waitRightBracket = 0;
      let s = states.name;
      const names = {};

      for (let i = 0; i < parts.length; i++) {
        let part = parts[i];

        if (s === states.name) {
          if (part[0] === '(') {
            waitRightBracket++;
            part = part.substr(1);
          }

          if (part[part.length - 1] === ')') {
            waitRightBracket--;
            part = part.substr(0, part.length - 1);
          }

          if (part[0] === '!') {
            part = part.substr(1);
            s = states.logic;
          } else {
            s = states.logicOrCmp;
          }

          if (!/^[A-Za-z_]/.test(part))
            return undefined;
          names[part] = true;

          if (i === parts.length - 1)
            return {expr, names: Object.keys(names)};

          continue;
        }

        if (s === states.logicOrCmp) {
          if (i === parts.length - 1)
            return undefined;

          if (compares.indexOf(part) > -1) {
            s = states.operand;
            continue;
          }

          if (part === '||' || part === '&&') {
            s = states.name;
            i++;
            continue;
          }

          return undefined;
        }

        if (s === states.operand) {
          s = states.logic;

          if (part[part.length - 1] === ')') {
            waitRightBracket--;
            part = part.substr(0, part.length - 1);
          }

          const starts = part[0];
          const end = part[part.length - 1];

          if (starts === '\'' && end === '\'') {
            part = part.substr(1, part.length - 2);
            if (typeof(part) !== 'string')
              return undefined;
            continue;
          }

          if (starts !== '\'' && end !== '\'') {
            if (isNaN(part))
              return undefined;
            continue;
          }

          return undefined;
        }

        if (s === states.logic) {
          if (i === parts.length - 1)
            return undefined;

          if (part === '||' || part === '&&') {
            s = states.name;
            continue;
          }

          return undefined;
        }

        return undefined;
      }

      if (waitRightBracket !== 0)
        return undefined;

      return {expr, names: Object.keys(names)};
    },
    transformedOptions() {
      return this.options.map(o => {
        if (!Array.isArray(o))
          o = [o];
        o[0] = o[0] + '';
        if (o.length === 1)
          return [o[0], o[0]];
        return o;
      });
    },
    uciOptName() {
      return this.uciOption || this.name;
    },
    parsedRules() {
      let rules = this.rules;

      if (typeof(rules) === 'string' || typeof(rules) === 'function')
        rules = [rules];

      if (typeof(rules) === 'object' && !Array.isArray(rules))
        rules = [rules];

      if (typeof(rules) === 'undefined')
        rules = [];

      return rules;
    }
  },
  watch: {
    'uciSection.loaded'() {
      this.buildForm();
    }
  },
  methods: {
    formProp(sid) {
      return `${sid}_${this.uid}_${this.name}`;
    },
    formValue(sid) {
      return this.form[this.formProp(sid)];
    },
    buildFormRule(sid) {
      const rules = [];

      if (this.required)
        rules.push({required: true, message: this.$t('This field is required')});

      this.parsedRules.forEach(rule => {
        rule = validator.compile(rule, this);
        rules.push(...rule);
      });

      const prop = this.formProp(sid);
      this.$set(this.uciForm.rules, prop, rules);
      this.$set(this.uciForm.validates, prop, {valid: true, tab: this.tabName, sid: sid});
    },
    buildFormValue(sid, value) {
      if (typeof(value) === 'undefined' && typeof(this.initial) !== 'undefined')
        value = this.initial + '';

      if (typeof(value) !== 'undefined') {
        if (this.type === 'list' && this.multiple)
          value = value.replace(/\s+/g, ' ').split(' ');
      }

      if (typeof(value) === 'undefined') {
        if (this.type === 'dlist')
          value = [];
        else if (this.type === 'list')
          value = this.multiple ? [] : '';
        else if (this.type === 'switch')
          value = '0';
        else
          value = '';
      }

      const prop = this.formProp(sid);
      this.original = value;
      this.$set(this.form, prop, value);

      this.$watch(`form.${prop}`, value => {
        this.$emit('change', value, this);
      });

      this.$emit('change', value, this);
    },
    buildFormSid(sid) {
      let value = undefined;

      if (typeof(this.load) === 'function') {
        new Promise(resolve => {
          this.load(resolve, sid, this.name);
        }).then(v => {
          this.buildFormValue(sid, v);
        });
      } else if (typeof(this.load) !== 'undefined') {
        this.buildFormValue(sid, this.load);
        this.$watch('load', value => {
          this.$set(this.form, this.formProp(sid), value);
        });
      } else {
        value = this.$uci.get(this.config, sid, this.uciOptName);
      }

      this.buildFormValue(sid, value);
      this.buildFormRule(sid);
    },
    buildForm(sid) {
      if (sid) {
        this.buildFormSid(sid);
        return;
      }

      this.uciSection.sids.forEach(sid => {
        this.buildFormSid(sid);
      });
    },
    destroyFormSid(sid) {
      const prop = this.formProp(sid);
      this.$delete(this.uciForm.form, prop);
      this.$delete(this.uciForm.rules, prop);
      this.$delete(this.uciForm.validates, prop);
    },
    destroyForm() {
      this.uciSection.sids.forEach(sid => {
        this.destroyFormSid(sid);
      });
    },
    saveUCI(sid) {
      if (this.type === 'dummy')
        return;

      let value = this.formValue(sid);
      if (value === this.original)
        return;

      if (this.save) {
        if (typeof(this.save) === 'function')
          this.save(this.config, sid, this.name, value);
        return;
      }

      if (this.type === 'list' && this.multiple)
        value = value.join(' ');

      this.$uci.set(this.config, sid, this.uciOptName, value);
    },
    applyUCI(sid) {
      if (this.type === 'dummy')
        return null;

      const value = this.formValue(sid);
      if (value === this.original)
        return null;

      if (typeof(this.apply) !== 'undefined') {
        const p = new Promise(resolve => {
          this.apply(resolve, value);
        });
        return p;
      }

      return null;
    }
  },
  created() {
    this.uid = this.uciForm.getUID();
    this.$set(this.uciSection.options, this.name, this);

    if (this.uciSection.loaded)
      this.buildForm();
  },
  render(h) {
    return h('div', this.$slots.default);
  },
  destroyed() {
    const o = this.uciSection.options[this.name];
    if (o.uid === this.uid)
      this.$delete(this.uciSection.options, this.name);

    this.destroyForm();
  }
}
