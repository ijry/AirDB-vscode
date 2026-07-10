<template>
  <div>
    <section class="mt-5">
      <div class="inline-block mb-2 mr-10">
        <label class="inline-block w-32 mr-5 font-bold">Database File</label>
        <input class="w-64 field__input" placeholder="DuckDB database file" v-model="connectionOption.dbPath" />
        <button class="ml-2 button button--primary" type="button" @click="$emit('choose', 'duckdb')">Choose</button>
      </div>
    </section>
  </div>
</template>

<script>
export default {
  props: ["connectionOption"],
};
</script>
