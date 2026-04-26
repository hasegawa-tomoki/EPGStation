<template>
    <v-main>
        <v-container class="fill-height" fluid>
            <v-row align="center" justify="center">
                <v-col cols="12" sm="8" md="4">
                    <v-card>
                        <v-toolbar flat color="primary" dark>
                            <v-toolbar-title>EPGStation ログイン</v-toolbar-title>
                        </v-toolbar>
                        <v-card-text>
                            <v-form v-on:submit.prevent="onSubmit">
                                <v-text-field v-model="user" label="ユーザー名" name="user" type="text" autocomplete="username" required autofocus></v-text-field>
                                <v-text-field v-model="password" label="パスワード" name="password" type="password" autocomplete="current-password" required></v-text-field>
                                <v-alert v-if="errorMessage !== ''" type="error" dense outlined class="mb-2">
                                    {{ errorMessage }}
                                </v-alert>
                                <v-btn type="submit" color="primary" block :loading="busy" :disabled="busy">ログイン</v-btn>
                            </v-form>
                        </v-card-text>
                    </v-card>
                </v-col>
            </v-row>
        </v-container>
    </v-main>
</template>

<script lang="ts">
import axios from 'axios';
import { Component, Vue } from 'vue-property-decorator';

@Component
export default class Login extends Vue {
    public user: string = '';
    public password: string = '';
    public errorMessage: string = '';
    public busy: boolean = false;

    public async onSubmit(): Promise<void> {
        if (this.busy === true) {
            return;
        }
        this.errorMessage = '';
        this.busy = true;
        try {
            await axios.post('./api/login', { user: this.user, password: this.password });
            const redirect = (this.$route.query.redirect as string) || '/';
            await this.$router.replace(redirect);
            // ログイン後はチャネル等の初期データを取り直すため一度リロード
            window.location.reload();
        } catch (err: any) {
            const status = err?.response?.status;
            if (status === 401) {
                this.errorMessage = 'ユーザー名またはパスワードが違います';
            } else {
                this.errorMessage = `ログインに失敗しました (${status ?? 'network error'})`;
            }
        } finally {
            this.busy = false;
        }
    }
}
</script>
