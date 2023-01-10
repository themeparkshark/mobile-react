import { Button, SafeAreaView, TextInput } from 'react-native';
import { useCallback, useContext, useLayoutEffect, useState } from 'react';
import { Cell, Section, TableView } from 'react-native-tableview-simple';
import updateUser from '../../api/endpoints/me/update-user';
import { AuthContext } from '../../context/AuthProvider';
import { useFocusEffect } from '@react-navigation/native';
import recordActivity from '../../api/endpoints/activities/create';

export default function UpdateEmailScreen({ navigation }) {
  const { user } = useContext(AuthContext);
  const [email, setEmail] = useState(user.email);

  useFocusEffect(
    useCallback(() => {
      recordActivity('Viewed the Update Email screen.');
    }, [])
  );

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Button
          title="Done"
          onPress={async () => {
            await updateUser({
              email,
            });

            navigation.goBack();
          }}
        />
      ),
    });
  }, [navigation, email]);

  return (
    <SafeAreaView>
      <TableView>
        <Section>
          <Cell
            cellContentView={
              <TextInput
                value={email}
                onChangeText={(text) => setEmail(text)}
                keyboardType={'email-address'}
                autoCapitalize={'none'}
              />
            }
          />
        </Section>
      </TableView>
    </SafeAreaView>
  );
}
