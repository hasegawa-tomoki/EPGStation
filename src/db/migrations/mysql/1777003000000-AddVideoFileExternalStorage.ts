/* eslint-disable max-len */
import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddVideoFileExternalStorage1777003000000 implements MigrationInterface {
    name = 'AddVideoFileExternalStorage1777003000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`video_file\` ADD \`externalStorageName\` text NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`video_file\` DROP COLUMN \`externalStorageName\``);
    }
}
